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
3. If the branch under test changes `convex/` (schema or functions), push them with `npx convex dev --once`. Watch out: the shared dev deployment's data may have drifted from the schema, which makes schema validation fail the deploy. Workaround: temporarily add the missing optional field to the schema before deploying, clean up the stale data (see `git log -S removeLegacyEventUrl` for a prior migration example), then restore the strict schema.
4. Inspect backend state (e.g. `auditLogs`, `flaggedEmails`) with `npx convex data <table> --order desc --limit N`.

## Authenticating as admin for testing
`CLERK_COOKIE` (repo secret) is a base64 blob that decodes to `;`-separated JSON cookie objects for localhost. **Caveat:** it may only contain the Clerk dev-browser token (`__clerk_db_jwt`) with `__client_uat=0` (a signed-OUT state) and therefore may NOT authenticate on its own — after injecting it `window.Clerk.user` stays `null` and `/admin` redirects to `${_repo_secret_dabit3/vending-machine_NEXT_PUBLIC_CLERK_SIGN_IN_URL}`. Verify by decoding it and checking for a real session; if it lacks `__session`/`__client_uat>0`, it needs re-exporting while signed in.

Reliable fallback (uses `CLERK_SECRET_KEY` from repo secrets): mint a single-use sign-in ticket for the admin user and consume it via Clerk's ticket strategy.
1. Find the admin user id: `GET https://api.clerk.com/v1/users?email_address=dabit3@gmail.com` with `Authorization: Bearer $CLERK_SECRET_KEY`.
2. `POST https://api.clerk.com/v1/sign_in_tokens` with `{"user_id":"<id>","expires_in_seconds":1800}` → returns `token`.
3. In the browser, navigate to `http://localhost:3000${_repo_secret_dabit3/vending-machine_NEXT_PUBLIC_CLERK_SIGN_IN_URL}?__clerk_ticket=<token>`. Clerk's `<SignIn>` consumes the ticket, sets `__session`, and redirects. Easiest: open the ticket URL with `DISPLAY=:1 xdg-open "$URL"` in the already-running Chrome (typing the long URL into the omnibox via keyboard emulation can drop characters and yield "This ticket is invalid"). Tickets are single-use — mint a fresh one per attempt. Alternatively drive it via Playwright over CDP (`http://localhost:29229`) using the already-running Chrome so cookies persist; `playwright-core` can be installed with `npm install --no-save playwright-core` and run with `NODE_PATH=<repo>/node_modules`.

**Most reliable (works in incognito too, no long-URL typing):** write the ticket URL into a tiny local redirect page and serve it, then type only the SHORT url in the omnibox:
```bash
mkdir -p /tmp/ticket
printf '<html><body><script>location="http://localhost:3000/sign-in?__clerk_ticket=%s"</script></body></html>' "$TOKEN" > /tmp/ticket/go.html
(cd /tmp/ticket && python3 -m http.server 8765 &)
# then navigate the browser to localhost:8765/go.html
```
This is the best way to sign an *attendee* (non-admin) test user into an incognito window (`Ctrl+Shift+N` in the existing Chrome) while the main window stays signed in as admin. Known attendee test users (verified emails): `attendee+clerk_test@example.com` (`user_3G...` lookup via Clerk API) and `attendee2+clerk_test@example.com`. To switch users in the same incognito window: avatar menu → Sign out (or the "Switch" button on a claim page), then load a fresh go.html with a new token. **Important:** the ticket is only consumed on the `/sign-in` page (Clerk `<SignIn>`) — appending `?__clerk_ticket=` to a claim page (`/<slug>`) does nothing. Always target `http://localhost:3000/sign-in?__clerk_ticket=<t>&redirect_url=%2F<slug>` and mint a fresh single-use token per attempt.

## Testing reactive/race scenarios (Convex)
Convex subscriptions push UI updates within ~200-500ms, so a second browser window usually re-renders before you can click (e.g. a "sold out" path is hidden reactively). To beat it deterministically, position two windows side-by-side (`DISPLAY=:0 wmctrl -i -r <winid> -b remove,maximized_vert,maximized_horz; ... -e 0,x,0,w,h`) and fire both clicks from the shell with real-display coordinates (screen is 1600x1200 while the computer tool space is 1024x768 — multiply by 1.5625): `DISPLAY=:0 xdotool mousemove X1 Y1 click 1 && sleep 0.05 && DISPLAY=:0 xdotool mousemove X2 Y2 click 1`. A 0.15s gap loses the race; 0.05s wins it. `xclip` is not installed; `google-chrome --incognito` from the shell does not open a visible window — use Ctrl+Shift+N in the existing Chrome.

After sign-in, `/admin` shows the "Admin" badge + avatar and the Events dashboard. Global admins see the "New event" button and per-event "Delete event" button (they render only when `access.isGlobalAdmin`).

## Create / delete event flow
- **Create:** /admin → "New event" → fill Name (slug auto-generates via `slugify`), optional Description/Credit/URL → "Create event". Expect toast `Event "<name>" created`, redirect to `/admin/events/<id>`, and the row in the /admin list. Confirm persistence by loading the public claim page `/<slug>` (should show the name+description).
- **Delete:** open the event's manage page → red "Delete event" → confirm in the `Delete "<name>"?` AlertDialog. Expect toast `Event "<name>" deleted`, redirect to `/admin`, row gone, and `/<slug>` now shows `Event not found`.
- Verifying the public claim page after each mutation is the strongest signal the change hit Convex (not just an optimistic UI blip).

## Codes card (two code blocks)
Events support up to two named code blocks. The Codes card lists each block (badge + count) with inline Rename ("Name this block" when unnamed). With existing codes, an "Add codes to" selector shows a button per block plus "+ Second code block" (hidden once two blocks exist); selecting it requires a "Second block name" and, if the current block is unnamed, a "Name the existing block" field — one submit renames then adds (backend `codes.renameType`; renaming into the other block's name merges blocks and syncs `events.codeTypes`). Public claim page shows an Alpha/Beta-style chooser only when two named blocks exist; Dispense is disabled until a type is chosen. With two blocks the "Add codes to" chips double as the code-list filter — the selected chip determines both where new codes go and which block's codes are listed below the form (no separate tab bar); with 0-1 blocks it stays a flat list. Blocks are ordered by creation time (not alphabetically) everywhere, and renames keep a block's position and selection. Uploading in the "Second code block" state defers the rename of an unnamed existing block until the file yields codes — an empty/invalid upload toasts "Nothing to import found in <file>" and must leave the block Unnamed.

## Devin Secrets Needed
- Repo-scoped secrets at `/run/repo_secrets/dabit3/vending-machine/.env.secrets`: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (needed for the sign-in-ticket auth fallback), `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `IS_DEVIN`, and `CLERK_COOKIE` (dev-browser cookie; may be signed-out).
