import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { generateMealPlan, generateReplacementMeal } from '../services/mealPlanner.js';
import { supabaseAdmin } from '../db/supabase.js';

const createMealPlanSchema = z.object({
  message: z.string().min(1).max(1000),
  weekStart: z.string().optional(),
});

const replaceMealSchema = z.object({
  message: z.string().max(500).optional(),
});

export async function mealPlanRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // Create a new meal plan from a natural language request
  app.post('/api/meal-plan', async (request, reply) => {
    const body = createMealPlanSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    const userId = request.user!.id;
    const { message, weekStart } = body.data;

    // Fetch user preferences if they exist
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    const mealPlanData = await generateMealPlan(message, prefs ? {
      dietaryRestrictions: prefs.dietary_restrictions,
      dislikedFoods: prefs.disliked_foods,
      favoriteCuisines: prefs.favorite_cuisines,
      householdSize: prefs.household_size,
      cookingTimePreference: prefs.cooking_time_preference,
      kidFriendly: prefs.kid_friendly,
      groceryBudget: prefs.grocery_budget,
    } : undefined);

    // Store the meal plan
    const { data: mealPlan, error: planError } = await supabaseAdmin
      .from('meal_plans')
      .insert({
        user_id: userId,
        title: mealPlanData.title,
        week_start: weekStart ?? getNextMonday(),
        status: 'draft',
      })
      .select()
      .single();

    if (planError || !mealPlan) {
      app.log.error(planError);
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to save meal plan',
        statusCode: 500,
      });
    }

    // Store each meal and its recipe
    const meals = [];
    for (const meal of mealPlanData.meals) {
      const { data: recipe } = await supabaseAdmin
        .from('recipes')
        .insert({
          title: meal.title,
          description: meal.description,
          servings: meal.servings,
          prep_time_minutes: meal.prepTimeMinutes,
          cook_time_minutes: meal.cookTimeMinutes,
          instructions: meal.instructions,
          ingredients: meal.ingredients,
        })
        .select()
        .single();

      const { data: mealRow } = await supabaseAdmin
        .from('meal_plan_meals')
        .insert({
          meal_plan_id: mealPlan.id,
          day_of_week: meal.dayOfWeek,
          meal_type: meal.mealType,
          title: meal.title,
          description: meal.description,
          recipe_id: recipe?.id ?? null,
          sort_order: meal.dayOfWeek * 10,
        })
        .select()
        .single();

      if (mealRow) {
        meals.push({
          ...mealRow,
          recipe: recipe ?? null,
        });
      }
    }

    return {
      mealPlan: {
        ...mealPlan,
        meals,
      },
    };
  });

  // Get the user's most recent meal plan
  app.get('/api/meal-plans/latest', async (request) => {
    const userId = request.user!.id;

    const { data: mealPlan } = await supabaseAdmin
      .from('meal_plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!mealPlan) {
      return { mealPlan: null };
    }

    const { data: meals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('*, recipes(*)')
      .eq('meal_plan_id', mealPlan.id)
      .order('sort_order');

    return {
      mealPlan: {
        ...mealPlan,
        meals: (meals ?? []).map(formatMealWithRecipe),
      },
    };
  });

  // Get a specific meal plan by ID
  app.get('/api/meal-plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const { data: mealPlan, error } = await supabaseAdmin
      .from('meal_plans')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !mealPlan) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Meal plan not found',
        statusCode: 404,
      });
    }

    const { data: meals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('*, recipes(*)')
      .eq('meal_plan_id', id)
      .order('sort_order');

    return {
      mealPlan: {
        ...mealPlan,
        meals: (meals ?? []).map(formatMealWithRecipe),
      },
    };
  });

  // Replace a single meal in a plan
  app.post('/api/meal-plans/:id/meals/:mealId/replace', async (request, reply) => {
    const { id, mealId } = request.params as { id: string; mealId: string };
    const userId = request.user!.id;
    const body = replaceMealSchema.safeParse(request.body ?? {});

    // Verify the meal plan belongs to this user
    const { data: mealPlan } = await supabaseAdmin
      .from('meal_plans')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!mealPlan) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Meal plan not found',
        statusCode: 404,
      });
    }

    // Get the existing meal
    const { data: existingMeal } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('*, recipes(*)')
      .eq('id', mealId)
      .eq('meal_plan_id', id)
      .single();

    if (!existingMeal) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Meal not found',
        statusCode: 404,
      });
    }

    // Get all meals in the plan for context (so we don't repeat)
    const { data: allMeals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('title')
      .eq('meal_plan_id', id);

    const existingTitles = (allMeals ?? []).map((m) => m.title);

    // Fetch user preferences
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    const replacement = await generateReplacementMeal({
      currentMealTitle: existingMeal.title,
      dayOfWeek: existingMeal.day_of_week,
      mealType: existingMeal.meal_type,
      existingMealTitles: existingTitles,
      userMessage: body.success ? body.data.message : undefined,
      preferences: prefs ? {
        dietaryRestrictions: prefs.dietary_restrictions,
        dislikedFoods: prefs.disliked_foods,
        favoriteCuisines: prefs.favorite_cuisines,
        householdSize: prefs.household_size,
        cookingTimePreference: prefs.cooking_time_preference,
        kidFriendly: prefs.kid_friendly,
      } : undefined,
    });

    // Save the new recipe
    const { data: newRecipe } = await supabaseAdmin
      .from('recipes')
      .insert({
        title: replacement.title,
        description: replacement.description,
        servings: replacement.servings,
        prep_time_minutes: replacement.prepTimeMinutes,
        cook_time_minutes: replacement.cookTimeMinutes,
        instructions: replacement.instructions,
        ingredients: replacement.ingredients,
      })
      .select()
      .single();

    // Update the meal
    await supabaseAdmin
      .from('meal_plan_meals')
      .update({
        title: replacement.title,
        description: replacement.description,
        recipe_id: newRecipe?.id ?? null,
      })
      .eq('id', mealId);

    // Return the full updated plan
    const { data: updatedMeals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('*, recipes(*)')
      .eq('meal_plan_id', id)
      .order('sort_order');

    return {
      mealPlan: {
        ...mealPlan,
        meals: (updatedMeals ?? []).map(formatMealWithRecipe),
      },
    };
  });
}

/** Normalize the Supabase join shape — recipes come back as an object under the key `recipes` */
function formatMealWithRecipe(row: Record<string, unknown>): Record<string, unknown> {
  const { recipes, ...meal } = row;
  return { ...meal, recipe: recipes ?? null };
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}
