import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_URL, getAppName } from "@/lib/app-name";

// Social-card renderer shared by the opengraph-image routes. Mirrors the
// dark home hero: mono eyebrow, large headline, one line of copy, and the
// brand-blue call to action, over the site's dot grid.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BG = "#121212";
const FG = "#f2f2f2";
const MUTED = "#9b9b9b";
const BORDER = "#333333";
const BRAND = "#467bf7";
const BRAND_FG = "#121212";

const root = process.cwd();
const [headingFont, bodyFont, monoFont, lockup] = await Promise.all([
  readFile(join(root, "assets/fonts/Geist-SemiBold.ttf")),
  readFile(join(root, "assets/fonts/Geist-Regular.ttf")),
  readFile(join(root, "assets/fonts/IBMPlexMono-Medium.ttf")),
  readFile(join(root, "public/devin-lockup-white.png"), "base64"),
]);
const lockupSrc = `data:image/png;base64,${lockup}`;
const host = new URL(APP_URL).host;

export type OgCard = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
};

export function homeCard(): OgCard {
  return {
    eyebrow: `${process.env.NEXT_PUBLIC_IS_DEVIN ? "Devin " : ""}Event credit distribution`,
    title: getAppName(),
    subtitle: "Sign in to claim your credits.",
    cta: "Sign in",
  };
}

// Long event names step down so they still fit on two lines.
function titleSize(title: string) {
  if (title.length <= 12) return 132;
  if (title.length <= 24) return 104;
  if (title.length <= 40) return 80;
  return 64;
}

export function renderOgImage(card: OgCard) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px",
          background: BG,
          backgroundImage: `radial-gradient(${BORDER} 1.5px, transparent 1.5px)`,
          backgroundSize: "36px 36px",
          color: FG,
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lockupSrc} alt="" width={128} height={44} />
          <div
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 20,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {host}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
          <div
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 20,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {card.eyebrow}
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: titleSize(card.title),
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
              fontWeight: 600,
              display: "block",
              lineClamp: 2,
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 32,
              lineHeight: 1.3,
              fontWeight: 400,
              color: MUTED,
              display: "block",
              lineClamp: 2,
            }}
          >
            {card.subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 36px",
              height: 68,
              borderRadius: 12,
              background: BRAND,
              color: BRAND_FG,
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            {card.cta}
          </div>
          <div
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Scan · Sign in · Claim
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: headingFont, weight: 600, style: "normal" },
        { name: "Geist", data: bodyFont, weight: 400, style: "normal" },
        {
          name: "IBM Plex Mono",
          data: monoFont,
          weight: 500,
          style: "normal",
        },
      ],
    },
  );
}
