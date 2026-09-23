"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";

// Clerk knows whether the visitor is signed in before Convex does: on the
// server from the session cookie, and in the browser the instant a sign-in or
// sign-out completes. Convex only reports `isAuthenticated` once the backend
// has validated a token, and reports signed-out (not loading) in between. So
// pick what to show from Clerk, and gate authenticated queries on Convex.
export function useViewerAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  return {
    authReady: isLoaded,
    signedIn: isLoaded && isSignedIn === true,
    canQuery: isAuthenticated,
  };
}
