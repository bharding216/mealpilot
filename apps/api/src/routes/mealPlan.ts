import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { generateMealPlan, generateReplacementMeal, generateMealSuggestions, generateRecipeForMeal } from '../services/mealPlanner.js';
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

  // ─── Chat-based meal suggestions (conversational) ───

  const chatSuggestSchema = z.object({
    message: z.string().min(1).max(1000),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional().default([]),
    mealType: z.string().optional().default('dinner'),
  });

  app.post('/api/chat/suggest', async (request, reply) => {
    const body = chatSuggestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Bad Request', message: body.error.issues.map((i) => i.message).join(', ') });
    }

    const userId = request.user!.id;
    const { message, conversationHistory, mealType } = body.data;

    // Get user preferences
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get existing meals in current plan to avoid repeats
    const { data: latestPlan } = await supabaseAdmin
      .from('meal_plans')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let existingTitles: string[] = [];
    if (latestPlan) {
      const { data: meals } = await supabaseAdmin
        .from('meal_plan_meals')
        .select('title')
        .eq('meal_plan_id', latestPlan.id);
      existingTitles = (meals ?? []).map((m) => m.title);
    }

    const result = await generateMealSuggestions(
      message,
      conversationHistory,
      existingTitles,
      prefs ? {
        dietaryRestrictions: prefs.dietary_restrictions,
        dislikedFoods: prefs.disliked_foods,
        favoriteCuisines: prefs.favorite_cuisines,
        householdSize: prefs.household_size,
        cookingTimePreference: prefs.cooking_time_preference,
        kidFriendly: prefs.kid_friendly,
        groceryBudget: prefs.grocery_budget,
      } : undefined,
    );

    return result;
  });

  // ─── Preview a recipe (generates it but does NOT save) ───

  const previewRecipeSchema = z.object({
    title: z.string(),
    description: z.string(),
    mealType: z.string().default('dinner'),
  });

  app.post('/api/chat/preview-recipe', async (request, reply) => {
    const body = previewRecipeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Bad Request' });
    }

    const userId = request.user!.id;
    const { title: mealTitle, description: mealDesc, mealType } = body.data;

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    const recipe = await generateRecipeForMeal(
      mealTitle,
      mealDesc,
      0,
      mealType,
      prefs ? {
        dietaryRestrictions: prefs.dietary_restrictions,
        dislikedFoods: prefs.disliked_foods,
        favoriteCuisines: prefs.favorite_cuisines,
        householdSize: prefs.household_size,
        cookingTimePreference: prefs.cooking_time_preference,
        kidFriendly: prefs.kid_friendly,
      } : undefined,
    );

    return { recipe };
  });

  // ─── Add a selected meal to the plan (generates full recipe) ───

  const addMealSchema = z.object({
    title: z.string(),
    description: z.string(),
    dayOfWeek: z.number().min(0).max(6),
    mealType: z.string().default('dinner'),
  });

  app.post('/api/meal-plan/add-meal', async (request, reply) => {
    const body = addMealSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Bad Request', message: body.error.issues.map((i) => i.message).join(', ') });
    }

    const userId = request.user!.id;
    const { title: mealTitle, description: mealDesc, dayOfWeek, mealType } = body.data;

    // Get or create a meal plan for this week
    let { data: mealPlan } = await supabaseAdmin
      .from('meal_plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!mealPlan) {
      const { data: newPlan, error: planError } = await supabaseAdmin
        .from('meal_plans')
        .insert({
          user_id: userId,
          title: 'This Week',
          week_start: getNextMonday(),
          status: 'draft',
        })
        .select()
        .single();

      if (planError || !newPlan) {
        return reply.code(500).send({ error: 'Failed to create meal plan' });
      }
      mealPlan = newPlan;
    }

    // Get user preferences for recipe generation
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Generate the full recipe
    const recipeSuggestion = await generateRecipeForMeal(
      mealTitle,
      mealDesc,
      dayOfWeek,
      mealType,
      prefs ? {
        dietaryRestrictions: prefs.dietary_restrictions,
        dislikedFoods: prefs.disliked_foods,
        favoriteCuisines: prefs.favorite_cuisines,
        householdSize: prefs.household_size,
        cookingTimePreference: prefs.cooking_time_preference,
        kidFriendly: prefs.kid_friendly,
      } : undefined,
    );

    // Save the recipe
    const { data: recipe } = await supabaseAdmin
      .from('recipes')
      .insert({
        title: recipeSuggestion.title,
        description: recipeSuggestion.description,
        servings: recipeSuggestion.servings,
        prep_time_minutes: recipeSuggestion.prepTimeMinutes,
        cook_time_minutes: recipeSuggestion.cookTimeMinutes,
        instructions: recipeSuggestion.instructions,
        ingredients: recipeSuggestion.ingredients,
      })
      .select()
      .single();

    // Check if a meal already exists for this day/type and replace it
    const { data: existingMeal } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('id')
      .eq('meal_plan_id', mealPlan.id)
      .eq('day_of_week', dayOfWeek)
      .eq('meal_type', mealType)
      .single();

    let mealRow;
    if (existingMeal) {
      const { data: updated } = await supabaseAdmin
        .from('meal_plan_meals')
        .update({
          title: recipeSuggestion.title,
          description: recipeSuggestion.description,
          recipe_id: recipe?.id ?? null,
        })
        .eq('id', existingMeal.id)
        .select()
        .single();
      mealRow = updated;
    } else {
      const { data: inserted } = await supabaseAdmin
        .from('meal_plan_meals')
        .insert({
          meal_plan_id: mealPlan.id,
          day_of_week: dayOfWeek,
          meal_type: mealType,
          title: recipeSuggestion.title,
          description: recipeSuggestion.description,
          recipe_id: recipe?.id ?? null,
          sort_order: dayOfWeek * 10,
        })
        .select()
        .single();
      mealRow = inserted;
    }

    // Return the full updated plan
    const { data: allMeals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('*, recipes(*)')
      .eq('meal_plan_id', mealPlan.id)
      .order('sort_order');

    return {
      meal: mealRow ? { ...mealRow, recipe: recipe ?? null } : null,
      mealPlan: {
        ...mealPlan,
        meals: (allMeals ?? []).map(formatMealWithRecipe),
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

  // ─── Meal plan history ───
  app.get('/api/meal-plans/history', async (request) => {
    const userId = request.user!.id;

    const { data: plans } = await supabaseAdmin
      .from('meal_plans')
      .select('id, title, week_start, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!plans || plans.length === 0) {
      return { plans: [] };
    }

    const planIds = plans.map((p) => p.id);
    const { data: meals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('id, meal_plan_id, title, meal_type, day_of_week')
      .in('meal_plan_id', planIds)
      .order('sort_order');

    const mealsByPlan = new Map<string, typeof meals>();
    for (const meal of meals ?? []) {
      const list = mealsByPlan.get(meal.meal_plan_id) ?? [];
      list.push(meal);
      mealsByPlan.set(meal.meal_plan_id, list);
    }

    return {
      plans: plans.map((plan) => {
        const planMeals = mealsByPlan.get(plan.id) ?? [];
        return {
          ...plan,
          meal_count: planMeals.length,
          meals: planMeals,
        };
      }),
    };
  });

  // ─── Favorites / Cookbook ───

  // Get user's favorite recipes
  app.get('/api/recipes/favorites', async (request) => {
    const userId = request.user!.id;

    const { data: saved } = await supabaseAdmin
      .from('saved_recipes')
      .select(`
        id,
        recipe_id,
        created_at,
        recipes (
          id,
          title,
          description,
          servings,
          prep_time_minutes,
          cook_time_minutes
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return {
      favorites: (saved ?? []).map((s: any) => ({
        id: s.id,
        recipe_id: s.recipe_id,
        title: s.recipes?.title ?? 'Unknown',
        description: s.recipes?.description ?? null,
        meal_type: 'dinner',
        prep_time_minutes: s.recipes?.prep_time_minutes ?? null,
        cook_time_minutes: s.recipes?.cook_time_minutes ?? null,
        servings: s.recipes?.servings ?? 0,
        saved_at: s.created_at,
      })),
    };
  });

  // Save a recipe as favorite
  app.post('/api/recipes/:recipeId/favorite', async (request, reply) => {
    const { recipeId } = request.params as { recipeId: string };
    const userId = request.user!.id;

    const { error } = await supabaseAdmin
      .from('saved_recipes')
      .upsert({
        user_id: userId,
        recipe_id: recipeId,
      }, {
        onConflict: 'user_id,recipe_id',
      });

    if (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to save recipe' });
    }

    return { success: true };
  });

  // Remove a recipe from favorites
  app.delete('/api/recipes/:recipeId/favorite', async (request, reply) => {
    const { recipeId } = request.params as { recipeId: string };
    const userId = request.user!.id;

    const { error } = await supabaseAdmin
      .from('saved_recipes')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId);

    if (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to remove favorite' });
    }

    return { success: true };
  });

  // Get a recipe by ID (for standalone viewing from Cookbook)
  app.get('/api/recipes/:recipeId', async (request, reply) => {
    const { recipeId } = request.params as { recipeId: string };

    const { data: recipe, error } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .single();

    if (error || !recipe) {
      return reply.code(404).send({ error: 'Recipe not found' });
    }

    return { recipe };
  });

  // Check if a recipe is favorited
  app.get('/api/recipes/:recipeId/favorite', async (request) => {
    const { recipeId } = request.params as { recipeId: string };
    const userId = request.user!.id;

    const { data } = await supabaseAdmin
      .from('saved_recipes')
      .select('id')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .maybeSingle();

    return { isFavorite: !!data };
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
