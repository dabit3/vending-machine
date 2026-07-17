---
name: testing-vending-machine
description: Run and test the Vending Machine app locally (Next.js + Convex + Clerk). Use when verifying admin flows like creating/deleting events, or setting up an authenticated admin session for testing.
---

# Testing the Vending Machine app

## Stack
- Next.js (App Router) frontend on `http://localhost:3000` (`npm run dev`).
- Convex cloud dev backend (functions already deployed; no need to run `npx convex dev` just to test existing flows).
- Clerk dev instance for admin auth. Admin routes (`/admin(.*)`) are protected by Clerk middleware (`proxy.ts`).
- Admin allowlist lives in Convex (`admins` table). While it's empty any signed-in user is admin ("bootstrap mode"); otherwise only listed emails. `dabit3@gmail.com` is a global admin.

## Local setup
1. Create `.env.local` from repo-scoped secrets (excludes `CLERK_COOKIE`, which is a browser cookie not an app var):
   ```bash
   grep -v -E 'CLERK_COOKIE' /run/repo_secrets/dabit3/vending-machine/.env.secrets | sed 's/^export //' > .env.local
   ```
2. `npm install` then `npm run dev`. Home `/` and claim pages `/<slug>` are public; `/admin` requires auth.

## Authenticating as admin for testing
`CLERK_COOKIE` (repo secret) is a base64 blob that decodes to `;`-separated JSON cookie objects for localhost. **Caveat:** it may only contain the Clerk dev-browser token (`__clerk_db_jwt`) with `__client_uat=0` (a signed-OUT state) and therefore may NOT authenticate on its own — after injecting it `window.Clerk.user` stays `null` and `/admin` redirects to `${_repo_secret_dabit3/vending-machine_NEXT_PUBLIC_CLERK_SIGN_IN_URL}`. Verify by decoding it and checking for a real session; if it lacks `__session`/`__client_uat>0`, it needs re-exporting while signed in.

Reliable fallback (uses `CLERK_SECRET_KEY` from repo secrets): mint a single-use sign-in ticket for the admin user and consume it via Clerk's ticket strategy.
1. Find the admin user id: `GET https://api.clerk.com/v1/users?email_address=dabit3@gmail.com` with `Authorization: Bearer $CLERK_SECRET_KEY`.
2. `POST https://api.clerk.com/v1/sign_in_tokens` with `{"user_id":"<id>","expires_in_seconds":1800}` → returns `token`.
3. In the browser, navigate to `http://localhost:3000${_repo_secret_dabit3/vending-machine_NEXT_PUBLIC_CLERK_SIGN_IN_URL}?__clerk_ticket=<token>`. Clerk's `<SignIn>` consumes the ticket, sets `__session`, and redirects. Drive this via Playwright over CDP (`http://localhost:29229`) using the already-running Chrome so cookies persist; `playwright-core` can be installed with `npm install --no-save playwright-core` and run with `NODE_PATH=<repo>/node_modules`.

After sign-in, `/admin` shows the "Admin" badge + avatar and the Events dashboard. Global admins see the "New event" button and per-event "Delete event" button (they render only when `access.isGlobalAdmin`).

## Create / delete event flow
- **Create:** /admin → "New event" → fill Name (slug auto-generates via `slugify`), optional Description/Credit/URL → "Create event". Expect toast `Event "<name>" created`, redirect to `/admin/events/<id>`, and the row in the /admin list. Confirm persistence by loading the public claim page `/<slug>` (should show the name+description).
- **Delete:** open the event's manage page → red "Delete event" → confirm in the `Delete "<name>"?` AlertDialog. Expect toast `Event "<name>" deleted`, redirect to `/admin`, row gone, and `/<slug>` now shows `Event not found`.
- Verifying the public claim page after each mutation is the strongest signal the change hit Convex (not just an optimistic UI blip).

## Devin Secrets Needed
- Repo-scoped secrets at `/run/repo_secrets/dabit3/vending-machine/.env.secrets`: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (needed for the sign-in-ticket auth fallback), `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `IS_DEVIN`, and `CLERK_COOKIE` (dev-browser cookie; may be signed-out).
