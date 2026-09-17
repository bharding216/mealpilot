import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';
import { consolidateIngredients, filterPantryItems } from '../services/ingredients.js';

const addPantryItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().default('other'),
});

export async function groceryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // Generate a grocery list from a meal plan
  app.post('/api/grocery-list/:mealPlanId/generate', async (request, reply) => {
    const { mealPlanId } = request.params as { mealPlanId: string };
    const userId = request.user!.id;

    // Verify the meal plan belongs to this user
    const { data: mealPlan } = await supabaseAdmin
      .from('meal_plans')
      .select('id')
      .eq('id', mealPlanId)
      .eq('user_id', userId)
      .single();

    if (!mealPlan) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Meal plan not found',
        statusCode: 404,
      });
    }

    // Get all meals with their recipes
    const { data: meals } = await supabaseAdmin
      .from('meal_plan_meals')
      .select('title, recipe_id, recipes(title, ingredients)')
      .eq('meal_plan_id', mealPlanId);

    if (!meals || meals.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Meal plan has no meals',
        statusCode: 400,
      });
    }

    // Build recipe data for consolidation
    const recipeData = meals
      .filter((m: any) => m.recipes?.ingredients)
      .map((m: any) => ({
        title: (m.recipes as any).title ?? m.title,
        ingredients: (m.recipes as any).ingredients as {
          name: string;
          quantity: number | null;
          unit: string | null;
          notes: string | null;
          category: string;
        }[],
      }));

    // Consolidate ingredients
    const consolidated = consolidateIngredients(recipeData);

    // Fetch user's pantry items
    const { data: pantryRows } = await supabaseAdmin
      .from('pantry_items')
      .select('name')
      .eq('user_id', userId);

    const pantryNames = (pantryRows ?? []).map((p) => p.name);
    const { needed, inPantry } = filterPantryItems(consolidated, pantryNames);

    // Delete any existing grocery list for this plan
    await supabaseAdmin
      .from('grocery_lists')
      .delete()
      .eq('meal_plan_id', mealPlanId)
      .eq('user_id', userId);

    // Create the grocery list
    const { data: groceryList, error: listError } = await supabaseAdmin
      .from('grocery_lists')
      .insert({
        user_id: userId,
        meal_plan_id: mealPlanId,
      })
      .select()
      .single();

    if (listError || !groceryList) {
      app.log.error(listError);
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to create grocery list',
        statusCode: 500,
      });
    }

    // Insert all items
    const allItems = [
      ...needed.map((item, idx) => ({
        grocery_list_id: groceryList.id,
        name: item.displayName,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        in_pantry: false,
        checked: false,
        sort_order: idx,
      })),
      ...inPantry.map((item, idx) => ({
        grocery_list_id: groceryList.id,
        name: item.displayName,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        in_pantry: true,
        checked: false,
        sort_order: needed.length + idx,
      })),
    ];

    if (allItems.length > 0) {
      await supabaseAdmin.from('grocery_items').insert(allItems);
    }

    // Fetch the complete list
    const { data: items } = await supabaseAdmin
      .from('grocery_items')
      .select('*')
      .eq('grocery_list_id', groceryList.id)
      .order('sort_order');

    return {
      groceryList: {
        ...groceryList,
        items: items ?? [],
      },
    };
  });

  // Get the grocery list for a meal plan
  app.get('/api/grocery-list/:mealPlanId', async (request, reply) => {
    const { mealPlanId } = request.params as { mealPlanId: string };
    const userId = request.user!.id;

    const { data: groceryList } = await supabaseAdmin
      .from('grocery_lists')
      .select('*')
      .eq('meal_plan_id', mealPlanId)
      .eq('user_id', userId)
      .single();

    if (!groceryList) {
      return { groceryList: null };
    }

    const { data: items } = await supabaseAdmin
      .from('grocery_items')
      .select('*')
      .eq('grocery_list_id', groceryList.id)
      .order('sort_order');

    return {
      groceryList: {
        ...groceryList,
        items: items ?? [],
      },
    };
  });

  // Toggle an item's checked state
  app.patch('/api/grocery-items/:itemId/toggle', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const userId = request.user!.id;

    // Verify ownership via join
    const { data: item } = await supabaseAdmin
      .from('grocery_items')
      .select('*, grocery_lists!inner(user_id)')
      .eq('id', itemId)
      .single();

    if (!item || (item as any).grocery_lists?.user_id !== userId) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Item not found',
        statusCode: 404,
      });
    }

    const { data: updated } = await supabaseAdmin
      .from('grocery_items')
      .update({ checked: !item.checked })
      .eq('id', itemId)
      .select()
      .single();

    return { item: updated };
  });

  // ─── Pantry ───

  // Get all pantry items
  app.get('/api/pantry', async (request) => {
    const userId = request.user!.id;
    const { data: items } = await supabaseAdmin
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    return { items: items ?? [] };
  });

  // Add a pantry item
  app.post('/api/pantry', async (request, reply) => {
    const body = addPantryItemSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    const userId = request.user!.id;

    const { data: item, error } = await supabaseAdmin
      .from('pantry_items')
      .insert({
        user_id: userId,
        name: body.data.name,
        category: body.data.category,
      })
      .select()
      .single();

    if (error) {
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to add pantry item',
        statusCode: 500,
      });
    }

    return { item };
  });

  // Delete a pantry item
  app.delete('/api/pantry/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const userId = request.user!.id;

    await supabaseAdmin
      .from('pantry_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    return { success: true };
  });
}
