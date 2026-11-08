"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";

/**
 * Account profile menu for the app shell — Clerk `UserButton` (handles
 * profile, session management, sign-out). Renders a sign-in link for
 * guests instead of pretending a session exists.
 */
export function ProfileMenu() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded) {
    return <span aria-hidden className="profile-menu__placeholder" />;
  }
  if (!isSignedIn) {
    return <Link href="/sign-in">Sign in</Link>;
  }
  return (
    <div className="profile-menu">
      <UserButton />
      <span className="sr-only">Signed in as {user.id}</span>
    </div>
  );
}
