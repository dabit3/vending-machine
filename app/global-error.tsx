"use client";

import { useEffect } from "react";
import { getAppName } from "@/lib/app-name";
import { reportClientError } from "@/lib/client-error-report";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "global");
  }, [error]);

  const appName = getAppName();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Something went wrong · ${appName}`}</title>
        <style>{`
          :root { color-scheme: dark light; font-family: system-ui, sans-serif; background: #121212; color: #f2f2f2; }
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; }
          main { width: 100%; max-width: 540px; }
          .brand { font-size: 12px; letter-spacing: .15em; text-transform: uppercase; }
          h1 { font-size: 28px; letter-spacing: -.03em; margin: 28px 0 12px; }
          p { line-height: 1.6; color: #9b9b9b; margin: 0; }
          .ref { margin-top: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
          .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 24px; }
          button, a { min-height: 44px; border-radius: 10px; padding: 10px 18px; font: inherit; font-size: 14px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
          button { border: 0; background: #f2f2f2; color: #121212; }
          a { border: 1px solid #555; color: inherit; }
          button:focus-visible, a:focus-visible { outline: 3px solid #467bf7; outline-offset: 4px; }
          @media (prefers-color-scheme: light) { :root { background: #fafafa; color: #202020; } p { color: #5e5e5e; } button { background: #202020; color: #fafafa; } }
        `}</style>
      </head>
      <body>
        <main>
          <div className="brand">{appName}</div>
          <h1>Something went wrong</h1>
          <p>
            We hit an unexpected error loading this page. Try again, or head
            back to the home page.
          </p>
          {error.digest && <p className="ref">Reference: {error.digest}</p>}
          <div className="actions">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* Full document navigation recovers cleanly when the root layout has crashed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Go home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
