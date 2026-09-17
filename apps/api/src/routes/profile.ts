import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';

const updatePreferencesSchema = z.object({
  dietaryRestrictions: z.array(z.string()).optional(),
  dislikedFoods: z.array(z.string()).optional(),
  favoriteCuisines: z.array(z.string()).optional(),
  groceryBudget: z.number().nullable().optional(),
  cookingTimePreference: z.enum(['quick', 'moderate', 'any']).nullable().optional(),
  kidFriendly: z.boolean().optional(),
  leftoverPreference: z.enum(['yes', 'no', 'sometimes']).nullable().optional(),
  householdSize: z.number().int().min(1).nullable().optional(),
});

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  app.get('/api/profile', async (request) => {
    const userId = request.user!.id;

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      // Auto-create a profile on first access
      const { data: newProfile } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          user_id: userId,
          email: request.user!.email,
          display_name: null,
          household_size: null,
        })
        .select()
        .single();

      return { profile: newProfile };
    }

    return { profile };
  });

  app.get('/api/preferences', async (request) => {
    const userId = request.user!.id;

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!prefs) {
      const { data: newPrefs } = await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: userId,
          dietary_restrictions: [],
          disliked_foods: [],
          favorite_cuisines: [],
          grocery_budget: null,
          cooking_time_preference: null,
          kid_friendly: false,
          leftover_preference: null,
        })
        .select()
        .single();

      return { preferences: newPrefs };
    }

    return { preferences: prefs };
  });

  app.put('/api/preferences', async (request, reply) => {
    const body = updatePreferencesSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: body.error.issues.map((i) => i.message).join(', '),
        statusCode: 400,
      });
    }

    const userId = request.user!.id;
    const updates: Record<string, unknown> = {};

    if (body.data.dietaryRestrictions !== undefined)
      updates.dietary_restrictions = body.data.dietaryRestrictions;
    if (body.data.dislikedFoods !== undefined)
      updates.disliked_foods = body.data.dislikedFoods;
    if (body.data.favoriteCuisines !== undefined)
      updates.favorite_cuisines = body.data.favoriteCuisines;
    if (body.data.groceryBudget !== undefined)
      updates.grocery_budget = body.data.groceryBudget;
    if (body.data.cookingTimePreference !== undefined)
      updates.cooking_time_preference = body.data.cookingTimePreference;
    if (body.data.kidFriendly !== undefined)
      updates.kid_friendly = body.data.kidFriendly;
    if (body.data.leftoverPreference !== undefined)
      updates.leftover_preference = body.data.leftoverPreference;
    if (body.data.householdSize !== undefined)
      updates.household_size = body.data.householdSize;

    // Upsert preferences
    const { data: prefs, error } = await supabaseAdmin
      .from('user_preferences')
      .upsert(
        { user_id: userId, ...updates },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Failed to update preferences',
        statusCode: 500,
      });
    }

    return { preferences: prefs };
  });
}
