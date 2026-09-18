import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';

// ─── Schemas ───

const confirmMatchSchema = z.object({
  productId: z.string(),
  skuId: z.string(),
  productName: z.string(),
  brand: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  unitPrice: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  productUrl: z.string().nullable().optional(),
  inStock: z.boolean().optional(),
  category: z.string().nullable().optional(),
});

const updateStatusSchema = z.object({
  updates: z.array(
    z.object({
      groceryItemId: z.string().uuid(),
      status: z.enum(['matched', 'confirmed', 'rejected', 'in_cart']),
    }),
  ),
});

// ─── Routes ───

export async function hebRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // ────────────────────────────────────────────────────────────────────
  //  Product Matching (persistence only — search happens client-side)
  // ────────────────────────────────────────────────────────────────────

  /** Get matches for a grocery list. */
  app.get('/api/grocery-list/:mealPlanId/matches', async (request, reply) => {
    const { mealPlanId } = request.params as { mealPlanId: string };
    const userId = request.user!.id;

    const { data: groceryList } = await supabaseAdmin
      .from('grocery_lists')
      .select('id')
      .eq('meal_plan_id', mealPlanId)
      .eq('user_id', userId)
      .single();

    if (!groceryList) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Grocery list not found',
        statusCode: 404,
      });
    }

    const { data: items } = await supabaseAdmin
      .from('grocery_items')
      .select('id, name, quantity, unit, category, in_pantry, checked, product_matches(*)')
      .eq('grocery_list_id', groceryList.id)
      .eq('in_pantry', false)
      .order('sort_order');

    return { items: items ?? [] };
  });

  /** Save or update a product match for a grocery item. */
  app.put('/api/grocery-items/:itemId/match', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = confirmMatchSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    // Remove existing match(es) for this item
    await supabaseAdmin.from('product_matches').delete().eq('grocery_item_id', itemId);

    const { data: match, error } = await supabaseAdmin
      .from('product_matches')
      .insert({
        grocery_item_id: itemId,
        product_id: body.data.productId,
        sku_id: body.data.skuId,
        product_name: body.data.productName,
        brand: body.data.brand ?? null,
        size: body.data.size ?? null,
        price: body.data.price ?? null,
        unit_price: body.data.unitPrice ?? null,
        image_url: body.data.imageUrl ?? null,
        product_url: body.data.productUrl ?? null,
        in_stock: body.data.inStock ?? true,
        category: body.data.category ?? null,
        status: 'matched',
      })
      .select()
      .single();

    if (error) {
      request.log.error({ error }, 'Failed to save product match');
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to save match',
        statusCode: 500,
      });
    }

    return { match };
  });

  /** Batch update match statuses (e.g., after adding to cart). */
  app.post('/api/grocery-items/update-status', async (request, reply) => {
    const body = updateStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    for (const update of body.data.updates) {
      await supabaseAdmin
        .from('product_matches')
        .update({ status: update.status })
        .eq('grocery_item_id', update.groceryItemId);
    }

    return { success: true };
  });
}
