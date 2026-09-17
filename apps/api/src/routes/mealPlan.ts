import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { generateMealPlan } from '../services/mealPlanner.js';
import { supabaseAdmin } from '../db/supabase.js';

const createMealPlanSchema = z.object({
  message: z.string().min(1).max(1000),
  weekStart: z.string().optional(),
});

export async function mealPlanRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

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
        meals: meals ?? [],
      },
    };
  });
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}
