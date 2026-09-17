import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401,
      });
      return;
    }

    request.user = {
      id: data.user.id,
      email: data.user.email ?? '',
    };
  } catch {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
      statusCode: 401,
    });
  }
}
