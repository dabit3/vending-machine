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

Use `npx convex deploy --cmd 'npm run build'` as the build command (with `CONVEX_DEPLOY_KEY` set to a production deploy key) per the [Convex Vercel guide](https://docs.convex.dev/production/hosting/vercel) — it pushes functions to the prod Convex deployment and injects `NEXT_PUBLIC_CONVEX_URL` at build time.

### Going to production checklist

Dev and prod are fully separate instances in both Clerk and Convex — none of the dev config carries over. The "Development mode" badge in the Clerk UI goes away once the app runs on production (`pk_live_`) keys.

**Clerk (dashboard → create Production instance):**

1. Set your production domain; add the DNS records Clerk asks for (`clerk.<domain>` Frontend API CNAME, plus the email DNS records if you use email-code sign-in).
2. Google OAuth in production requires your own credentials: create a Google OAuth client and paste its ID/secret into Clerk's Google connection (dev instances use Clerk's shared ones).
3. Recreate the `convex` JWT template on the production instance (same claims as dev — see Clerk + Convex auth above).
4. In Vercel, set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_...`), `CLERK_SECRET_KEY` (`sk_live_...`), and `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`.

**Convex (prod deployment):**

5. Set the issuer domain on the prod deployment — for a Clerk production instance this is your custom domain, not `*.clerk.accounts.dev`:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain> --prod
   ```
6. The prod `admins` table starts empty (bootstrap mode: any signed-in user is admin) — sign in and add your email first thing.
7. Events, emails, and codes live per deployment; re-create/upload them in prod.
