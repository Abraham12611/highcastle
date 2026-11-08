/**
 * Next.js 16 `proxy.ts` (the middleware convention) — Clerk route guard.
 *
 * Protected: `/app/**` (signed-in account area). Public: marketing, sign-in/
 * sign-up, onboarding, demo entry, `/api/healthz`, static assets. API routes
 * are NOT intercepted here — `getHighCastleSession` inside each route
 * enforces server-side verification independently (defense in depth; the
 * demo cookie stays untouched by Clerk).
 *
 * Keyless mode: when no Clerk publishable key is configured (e.g. a VM
 * serving only the bounded `hc_demo` guest path), this middleware is a
 * pass-through — no Clerk code runs and no keys are required.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkConfigured } from "./server/auth/clerk";

const isProtected = createRouteMatcher(["/app(.*)"]);

const clerkGuard = clerkMiddleware(async (auth, req) => {
  if (!isProtected(req)) return;
  const { userId } = await auth();
  if (userId === null) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signIn);
  }
});

const keylessPassThrough = async (_req: NextRequest): Promise<Response> => NextResponse.next();

export default clerkConfigured() ? clerkGuard : keylessPassThrough;

export const config = {
  matcher: [
    // Run on everything except static assets + health probes.
    "/((?!_next|.*\\..*|healthz).*)",
  ],
};
