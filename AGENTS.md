<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Important - do not test locally with chromium / playright unless I specifically ask you to.

## Branding

- The app name is **Try Devin**, and its public domain is `https://trydevin.ai`.
- Keep the shared name and public URL in `lib/app-name.ts`. `IS_DEVIN` controls the logo, not the app name.
- Production Convex uses `SITE_URL=https://trydevin.ai` for approval-email links. Keep development URLs separate.
- Put theme switching in the shared `ProfileMenu` avatar dropdown, not the main header. Preserve the existing `next-themes` preferences and default.

## Verification

- Run `npm test` for backend, authorization, and server-rendered UI tests. Stripe calls use mocks.
- Run `npm run lint` for ESLint checks.
- Run `npx --no-install tsc --noEmit --incremental false` for TypeScript checks without cache changes.
- Run `npm run build` to verify the production build.

## Admin and Stripe access

- System admins require a verified Clerk email in the Convex `admins` table. An empty table grants no system-admin access.
- If the table is empty, add the first admin through the trusted Convex dashboard. The older testing skill describes obsolete bootstrap behavior.
- The Clerk `convex` JWT template must include the `email` and `email_verified` claims.
- Set `STRIPE_API_KEY` on the Convex deployment, not in the Next.js environment. Use a restricted key for Coupons and Promotion Codes.
- Keep Stripe calls in internal backend functions. Event admin access does not authorize Stripe operations or batch history access.
- Batch names use a shared 40-character cap in `lib/stripe-name.ts`. Shorten overlong names without an error before saving or calling Stripe.
- Code prefixes use a shared four-letter limit in `lib/stripe-name.ts`. Accept only ASCII letters and store them uppercase.
- Generate blank prefixes once in `startBatch`, after request deduplication. Keep generated prefixes out of request fingerprints.
- Preserve stored prefixes on retries, including longer or empty legacy prefixes.
- `/admin/codes` is the saved code library. `/admin/codes/new` creates standalone Stripe blocks without events and saves them automatically.
- Keep links from the event form to standalone code creation in a new tab, so the event draft stays open.
- Stripe batches retain their history after event deletion. Event deletion does not revoke coupons or promotion codes in Stripe.
- Resume failed batches within 23 hours of their first attempt. After that window, reconcile the batch in Stripe before generating replacements.
- Regenerate backend types with `npx convex codegen`. This command does not deploy the changed functions.
- Deploy the Convex functions and schema before using the new UI. Get user approval before deployment or real Stripe operations.
