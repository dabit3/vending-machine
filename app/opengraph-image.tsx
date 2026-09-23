import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  homeCard,
  renderOgImage,
} from "@/lib/og-image";

export const alt = "Try Devin — sign in to claim your credits.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(homeCard());
}
