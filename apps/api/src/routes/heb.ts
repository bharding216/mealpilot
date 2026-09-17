import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';
import { HebGroceryProvider } from '@mealpilot/heb';
import type { GroceryProviderProduct } from '@mealpilot/heb';

const saveSessionSchema = z.object({
  cookies: z.string().min(1),
});

const matchProductsSchema = z.object({
  groceryItemIds: z.array(z.string().uuid()).optional(),
});

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

const addToCartSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    skuId: z.string(),
    quantity: z.number().int().min(1).default(1),
    groceryItemId: z.string().uuid().optional(),
  })),
});

async function getHebClient(userId: string): Promise<HebGroceryProvider> {
  const { data: session } = await supabaseAdmin
    .from('heb_sessions')
    .select('cookies')
    .eq('user_id', userId)
    .single();

  if (!session?.cookies) {
    throw Object.assign(new Error('H-E-B session not found. Please connect your H-E-B account first.'), { statusCode: 401 });
  }

  const client = new HebGroceryProvider();
  client.setSession(session.cookies);
  return client;
}

export async function hebRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // ─── Session Management ───

  // Check if user has an active HEB session
  app.get('/api/heb/session', async (request) => {
    const userId = request.user!.id;

    const { data: session } = await supabaseAdmin
      .from('heb_sessions')
      .select('store_id, store_name, updated_at')
      .eq('user_id', userId)
      .single();

    return {
      connected: !!session,
      store: session?.store_id ? {
        storeId: session.store_id,
        name: session.store_name,
      } : null,
      lastUpdated: session?.updated_at ?? null,
    };
  });

  // Save HEB session cookies (from the user's browser login)
  app.post('/api/heb/session', async (request, reply) => {
    const body = saveSessionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid session data',
        statusCode: 400,
      });
    }

    const userId = request.user!.id;

    // Test the cookies by fetching the cart (also gets store info)
    const client = new HebGroceryProvider();
    client.setSession(body.data.cookies);

    let storeId: string | null = null;
    let storeName: string | null = null;

    try {
      const cart = await client.getCart();
      if (cart.store) {
        storeId = cart.store.storeId;
        storeName = cart.store.name;
      }
    } catch (err) {
      request.log.error({ err }, 'HEB session validation failed');
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid H-E-B session. Please try logging in again.',
        statusCode: 400,
      });
    }

    // Upsert the session
    const { data: existing } = await supabaseAdmin
      .from('heb_sessions')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      await supabaseAdmin
        .from('heb_sessions')
        .update({ cookies: body.data.cookies, store_id: storeId, store_name: storeName })
        .eq('user_id', userId);
    } else {
      await supabaseAdmin
        .from('heb_sessions')
        .insert({ user_id: userId, cookies: body.data.cookies, store_id: storeId, store_name: storeName });
    }

    return {
      connected: true,
      store: storeId ? { storeId, name: storeName } : null,
    };
  });

  // Disconnect HEB session
  app.delete('/api/heb/session', async (request) => {
    const userId = request.user!.id;
    await supabaseAdmin.from('heb_sessions').delete().eq('user_id', userId);
    return { connected: false };
  });

  // ─── Product Search & Matching ───

  // Search HEB products directly
  app.get('/api/heb/search', async (request, reply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        statusCode: 400,
      });
    }

    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const products = await client.searchProducts(q, limit ? parseInt(limit, 10) : 5);
    return { products };
  });

  // Auto-match grocery list items to HEB products
  app.post('/api/grocery-list/:mealPlanId/match-products', async (request, reply) => {
    const { mealPlanId } = request.params as { mealPlanId: string };
    const userId = request.user!.id;
    const body = matchProductsSchema.safeParse(request.body ?? {});

    // Get the grocery list
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

    // Get items to match (either specific IDs or all non-pantry items)
    let query = supabaseAdmin
      .from('grocery_items')
      .select('id, name, quantity, unit, category')
      .eq('grocery_list_id', groceryList.id)
      .eq('in_pantry', false);

    if (body.success && body.data.groceryItemIds?.length) {
      query = query.in('id', body.data.groceryItemIds);
    }

    const { data: items } = await query;
    if (!items?.length) {
      return { matches: [] };
    }

    const client = await getHebClient(userId);
    const matches: Array<{
      groceryItemId: string;
      groceryItemName: string;
      products: GroceryProviderProduct[];
      bestMatch: GroceryProviderProduct | null;
    }> = [];

    // Search for each grocery item
    for (const item of items) {
      try {
        const searchQuery = item.name;
        const products = await client.searchProducts(searchQuery, 5);

        const bestMatch = products.length > 0 ? products[0] : null;

        matches.push({
          groceryItemId: item.id,
          groceryItemName: item.name,
          products,
          bestMatch,
        });

        // Save the best match to the database
        if (bestMatch) {
          // Delete any existing match for this item
          await supabaseAdmin
            .from('product_matches')
            .delete()
            .eq('grocery_item_id', item.id);

          await supabaseAdmin
            .from('product_matches')
            .insert({
              grocery_item_id: item.id,
              product_id: bestMatch.productId,
              sku_id: bestMatch.skuId,
              product_name: bestMatch.name,
              brand: bestMatch.brand,
              size: bestMatch.size,
              price: bestMatch.price,
              unit_price: bestMatch.unitPrice,
              image_url: bestMatch.imageUrl,
              product_url: bestMatch.productUrl,
              in_stock: bestMatch.inStock,
              category: bestMatch.category,
              status: 'matched',
            });
        }
      } catch (err) {
        request.log.warn({ err, item: item.name }, 'Failed to search for item');
        matches.push({
          groceryItemId: item.id,
          groceryItemName: item.name,
          products: [],
          bestMatch: null,
        });
      }
    }

    return { matches };
  });

  // Get all product matches for a grocery list
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

  // Confirm or change a product match for a specific grocery item
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

    // Delete any existing match
    await supabaseAdmin
      .from('product_matches')
      .delete()
      .eq('grocery_item_id', itemId);

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
        status: 'confirmed',
      })
      .select()
      .single();

    if (error) {
      request.log.error({ error }, 'Failed to save product match');
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to save product match',
        statusCode: 500,
      });
    }

    return { match };
  });

  // ─── Cart Operations ───

  // Add matched items to HEB cart
  app.post('/api/heb/cart/add', async (request, reply) => {
    const body = addToCartSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    const userId = request.user!.id;
    const client = await getHebClient(userId);

    const results: Array<{ productId: string; success: boolean; error?: string }> = [];
    let latestCart = null;

    for (const item of body.data.items) {
      try {
        latestCart = await client.addToCart(item.productId, item.skuId, item.quantity);

        // Update match status to 'in_cart'
        if (item.groceryItemId) {
          await supabaseAdmin
            .from('product_matches')
            .update({ status: 'in_cart' })
            .eq('grocery_item_id', item.groceryItemId)
            .eq('product_id', item.productId);
        }

        results.push({ productId: item.productId, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        request.log.warn({ err, productId: item.productId }, 'Failed to add item to cart');
        results.push({ productId: item.productId, success: false, error: msg });
      }
    }

    return { results, cart: latestCart };
  });

  // Get current HEB cart
  app.get('/api/heb/cart', async (request) => {
    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const cart = await client.getCart();
    return { cart };
  });
}
