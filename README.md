# Credit Dispenser

Dispense credit codes to event participants (hackathons, conferences, meetups). Admins create events with a list of eligible emails and a pool of unique codes; attendees visit the event's URL (e.g. `/hackathon-1`), enter their email, and receive a code if their email is on the list.

## Stack

- [Next.js](https://nextjs.org) (App Router) — deployed on Vercel
- [Convex](https://convex.dev) — database & realtime backend
- [Clerk](https://clerk.com) — admin authentication
- Tailwind CSS — monochromatic dark theme

## How it works

1. Admin creates an event (slug auto-generated from the name, or set/edited manually).
2. Admin pastes in the list of eligible emails and the pool of unique codes.
3. Attendees visit `/<slug>` and sign in with Clerk (Google or email code) to prove they own their email address.
4. If the verified sign-in email is on the list, they're assigned an unclaimed code (idempotent — the same email always gets the same code back).
5. If not, they can't claim.

## Routes

- `/` — public list of events (newest first)
- `/<slug>` — claim page for an event (requires signing in to verify email ownership)
- `/admin` — admin dashboard (Clerk-protected): create events
- `/admin/events/<id>` — manage an event: edit name/slug/description, emails, codes, see claim stats
- `/sign-in` — Clerk sign-in page (kept same-origin so protected-route redirects don't break client navigations)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Convex + Clerk keys
npx convex dev               # in one terminal
npm run dev                  # in another
```

### Clerk + Convex auth

1. In Clerk, create a JWT template named `convex` (see [Convex Clerk docs](https://docs.convex.dev/auth/clerk)).
2. Set the issuer domain on your Convex deployment:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   ```

### Admin allowlist

Admin access is controlled by an email allowlist stored in Convex (`admins` table), managed at `/admin/admins`:

- **Bootstrap**: while the list is empty, any signed-in Clerk user is an admin. Sign in and add your own email to lock it down (the app forces your own email to be first, so you can't lock yourself out).
- Once the list has entries, only listed emails can use the admin dashboard or call admin Convex functions. The last remaining admin can't be removed.
- Emergency access: if you ever do get locked out, delete all rows from the `admins` table in the Convex dashboard to re-enter bootstrap mode.

The allowlist is per Convex deployment (dev and prod each have their own `admins` table).

## Deploy (Vercel)

Set `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` in Vercel, and use `npx convex deploy --cmd 'npm run build'` as the build command (with `CONVEX_DEPLOY_KEY` set) per the [Convex Vercel guide](https://docs.convex.dev/production/hosting/vercel).
