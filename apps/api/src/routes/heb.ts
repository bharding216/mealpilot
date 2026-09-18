import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';
import { HebGroceryProvider } from '@mealpilot/heb';
import type { GroceryProviderProduct } from '@mealpilot/heb';
import { initLogin, verifyOtp, cancelLogin } from '../services/heb-auth.js';

// ─── Schemas ───

const loginSchema = z.object({
  email: z.string().email(),
});

const verifySchema = z.object({
  loginId: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
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

// ─── Helpers ───

async function getHebClient(userId: string): Promise<HebGroceryProvider> {
  const { data: session } = await supabaseAdmin
    .from('heb_sessions')
    .select('cookies, hashes')
    .eq('user_id', userId)
    .single();

  if (!session?.cookies) {
    throw Object.assign(
      new Error('H-E-B session not found. Please connect your H-E-B account first.'),
      { statusCode: 401 }
    );
  }

  const hashes = typeof session.hashes === 'object' && session.hashes
    ? session.hashes as Record<string, string>
    : undefined;

  const client = new HebGroceryProvider(hashes);
  client.setSession(session.cookies);
  return client;
}

// ─── Routes ───

export async function hebRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // ────────────────────────────────────────────────────────────────────
  //  Session / Authentication
  // ────────────────────────────────────────────────────────────────────

  /** Check if the user has an active H-E-B session. */
  app.get('/api/heb/session', async (request) => {
    const userId = request.user!.id;
    const { data: session } = await supabaseAdmin
      .from('heb_sessions')
      .select('store_id, store_name, updated_at')
      .eq('user_id', userId)
      .single();

    return {
      connected: !!session,
      store: session?.store_id
        ? { storeId: session.store_id, name: session.store_name }
        : null,
      lastUpdated: session?.updated_at ?? null,
    };
  });

  /**
   * Step 1 — Start H-E-B login.
   * Launches a headless browser, enters the email, triggers OTP.
   * Returns a loginId the client uses for step 2.
   */
  app.post('/api/heb/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'A valid email is required.',
        statusCode: 400,
      });
    }

    try {
      const { loginId } = await initLogin(body.data.email);
      return { loginId, message: 'OTP sent. Check your email.' };
    } catch (err) {
      request.log.error({ err }, 'H-E-B login initiation failed');
      return reply.code(502).send({
        error: 'H-E-B Login Failed',
        message: err instanceof Error ? err.message : 'Could not connect to H-E-B.',
        statusCode: 502,
      });
    }
  });

  /**
   * Step 2 — Verify OTP.
   * Submits the OTP to H-E-B, extracts cookies, stores them encrypted.
   */
  app.post('/api/heb/verify', async (request, reply) => {
    const body = verifySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'loginId and a 6-digit OTP are required.',
        statusCode: 400,
      });
    }

    try {
      const result = await verifyOtp(body.data.loginId, body.data.otp);
      const userId = request.user!.id;

      // Upsert session
      const { data: existing } = await supabaseAdmin
        .from('heb_sessions')
        .select('id')
        .eq('user_id', userId)
        .single();

      const sessionData = {
        cookies: result.cookies,
        hashes: result.hashes,
        store_id: result.storeId,
        store_name: result.storeName,
      };

      if (existing) {
        await supabaseAdmin.from('heb_sessions').update(sessionData).eq('user_id', userId);
      } else {
        await supabaseAdmin.from('heb_sessions').insert({ user_id: userId, ...sessionData });
      }

      return {
        connected: true,
        store: result.storeId
          ? { storeId: result.storeId, name: result.storeName }
          : null,
      };
    } catch (err) {
      request.log.error({ err }, 'H-E-B OTP verification failed');
      const msg = err instanceof Error ? err.message : 'Verification failed';

      // If OTP was wrong, return 401
      if (msg.includes('sat cookie not found') || msg.includes('incorrect')) {
        return reply.code(401).send({
          error: 'Verification Failed',
          message: 'OTP may be incorrect or expired. Please try again.',
          statusCode: 401,
        });
      }

      return reply.code(502).send({
        error: 'H-E-B Verification Failed',
        message: msg,
        statusCode: 502,
      });
    }
  });

  /** Cancel an in-progress login. */
  app.delete('/api/heb/login/:loginId', async (request) => {
    const { loginId } = request.params as { loginId: string };
    cancelLogin(loginId);
    return { cancelled: true };
  });

  /** Disconnect H-E-B session. */
  app.delete('/api/heb/session', async (request) => {
    const userId = request.user!.id;
    await supabaseAdmin.from('heb_sessions').delete().eq('user_id', userId);
    return { connected: false };
  });

  // ────────────────────────────────────────────────────────────────────
  //  Product Search & Matching
  // ────────────────────────────────────────────────────────────────────

  /** Search H-E-B products. */
  app.get('/api/heb/search', async (request, reply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q) {
      return reply.code(400).send({ error: 'Bad Request', message: '"q" is required', statusCode: 400 });
    }

    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const products = await client.searchProducts(q, limit ? parseInt(limit, 10) : 5);
    return { products };
  });

  /** Typeahead suggestions (just search terms, not full products). */
  app.get('/api/heb/typeahead', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q) {
      return reply.code(400).send({ error: 'Bad Request', message: '"q" is required', statusCode: 400 });
    }

    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const terms = await client.typeahead(q);
    return { terms };
  });

  /** Auto-match grocery list items to H-E-B products. */
  app.post('/api/grocery-list/:mealPlanId/match-products', async (request, reply) => {
    const { mealPlanId } = request.params as { mealPlanId: string };
    const userId = request.user!.id;
    const body = matchProductsSchema.safeParse(request.body ?? {});

    const { data: groceryList } = await supabaseAdmin
      .from('grocery_lists')
      .select('id')
      .eq('meal_plan_id', mealPlanId)
      .eq('user_id', userId)
      .single();

    if (!groceryList) {
      return reply.code(404).send({ error: 'Not Found', message: 'Grocery list not found', statusCode: 404 });
    }

    let query = supabaseAdmin
      .from('grocery_items')
      .select('id, name, quantity, unit, category')
      .eq('grocery_list_id', groceryList.id)
      .eq('in_pantry', false);

    if (body.success && body.data.groceryItemIds?.length) {
      query = query.in('id', body.data.groceryItemIds);
    }

    const { data: items } = await query;
    if (!items?.length) return { matches: [] };

    const client = await getHebClient(userId);
    const matches: Array<{
      groceryItemId: string;
      groceryItemName: string;
      products: GroceryProviderProduct[];
      bestMatch: GroceryProviderProduct | null;
    }> = [];

    for (const item of items) {
      try {
        const products = await client.searchProducts(item.name, 5);
        const bestMatch = products[0] ?? null;

        matches.push({ groceryItemId: item.id, groceryItemName: item.name, products, bestMatch });

        if (bestMatch) {
          await supabaseAdmin.from('product_matches').delete().eq('grocery_item_id', item.id);
          await supabaseAdmin.from('product_matches').insert({
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
        request.log.warn({ err, item: item.name }, 'Failed to match item');
        matches.push({ groceryItemId: item.id, groceryItemName: item.name, products: [], bestMatch: null });
      }
    }

    return { matches };
  });

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
      return reply.code(404).send({ error: 'Not Found', message: 'Grocery list not found', statusCode: 404 });
    }

    const { data: items } = await supabaseAdmin
      .from('grocery_items')
      .select('id, name, quantity, unit, category, in_pantry, checked, product_matches(*)')
      .eq('grocery_list_id', groceryList.id)
      .eq('in_pantry', false)
      .order('sort_order');

    return { items: items ?? [] };
  });

  /** Confirm/change a product match. */
  app.put('/api/grocery-items/:itemId/match', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = confirmMatchSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Bad Request', message: body.error.issues.map(i => i.message).join(', '), statusCode: 400 });
    }

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
        status: 'confirmed',
      })
      .select()
      .single();

    if (error) {
      request.log.error({ error }, 'Failed to save product match');
      return reply.code(500).send({ error: 'Server Error', message: 'Failed to save match', statusCode: 500 });
    }

    return { match };
  });

  // ────────────────────────────────────────────────────────────────────
  //  Cart
  // ────────────────────────────────────────────────────────────────────

  /** Add items to H-E-B cart. */
  app.post('/api/heb/cart/add', async (request, reply) => {
    const body = addToCartSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Bad Request', message: body.error.issues.map(i => i.message).join(', '), statusCode: 400 });
    }

    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const results: Array<{ productId: string; success: boolean; error?: string }> = [];
    let latestCart = null;

    for (const item of body.data.items) {
      try {
        latestCart = await client.addToCart(item.productId, item.skuId, item.quantity);
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
        request.log.warn({ err, productId: item.productId }, 'Failed to add to cart');
        results.push({ productId: item.productId, success: false, error: msg });
      }
    }

    return { results, cart: latestCart };
  });

  /** Get current H-E-B cart. */
  app.get('/api/heb/cart', async (request) => {
    const userId = request.user!.id;
    const client = await getHebClient(userId);
    const cart = await client.getCart();
    return { cart };
  });
}
