import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export interface AuthContext {
  userId: string;
  email: string;
  role: 'manager' | 'staff' | 'tenant';
  orgId: string;
  tenantId?: string;
}

/**
 * Authenticates request via Authorization: Bearer token or Supabase session cookies.
 * Derives role and organization strictly from memberships or tenants table.
 */
export async function authenticateRequest(req?: NextRequest): Promise<AuthContext> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let authUser: { id: string; email?: string } | null = null;

  if (token) {
    // Authenticate with Bearer token
    const client = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      throw new AuthError("Unauthorized", 401);
    }
    authUser = user;
  } else {
    // Authenticate with Cookies
    const cookieStore = await cookies();
    const client = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    });

    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      throw new AuthError("Unauthorized", 401);
    }
    authUser = user;
  }

  // 1. Check if user has membership in an organization (manager or staff)
  const membership = await prisma.membership.findFirst({
    where: { userId: authUser.id },
  });

  if (membership) {
    return {
      userId: authUser.id,
      email: authUser.email || "",
      role: membership.role as 'manager' | 'staff',
      orgId: membership.orgId,
    };
  }

  // 2. Check if user is a tenant
  const tenant = await prisma.tenant.findFirst({
    where: { userId: authUser.id },
  });

  if (tenant) {
    return {
      userId: authUser.id,
      email: authUser.email || "",
      role: 'tenant',
      orgId: tenant.orgId,
      tenantId: tenant.id,
    };
  }

  // User authenticated in Supabase but not bound to any organization
  throw new AuthError("Forbidden: No organization membership or tenant profile", 403);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("API error:", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
