<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Important - do not test locally with chromium / playright unless I specifically ask you to.

## Verification

- Run `npm run lint` for ESLint checks.
- Run `npx --no-install tsc --noEmit --incremental false` for TypeScript checks without cache changes.
- Run `npm run build` to verify the production build.
