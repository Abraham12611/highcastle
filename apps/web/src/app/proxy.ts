/**
 * Next.js 16 `proxy.ts` (the middleware convention) — Clerk route guard.
 *
 * Protected: `/app/**` (signed-in account area). Public: marketing, sign-in/
 * sign-up, onboarding, demo entry, `/api/healthz`, static assets. API routes
 * are NOT intercepted here — `getHighCastleSession` inside each route
 * enforces server-side verification independently (defense in depth; the
 * demo cookie stays untouched by Clerk).
 *
 * When CLERK env is absent (unconfigured dev), the guard is a no-op so the
 * demo path keeps working.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtected = createRouteMatcher(["/app(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isProtected(req)) return;
  const { userId } = await auth();
  if (userId === null) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signIn);
  }
});

export const config = {
  matcher: [
    // Run on everything except static assets + health probes.
    "/((?!_next|.*\\..*|healthz).*)",
  ],
};
