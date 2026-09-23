// Max-width of the site header/footer bar, chosen per page so the wordmark
// and footer line up with the content column below them. Every bar has
// `px-4 sm:px-6` inside the box, so widths include that padding.
export const PAGE_WIDTHS = {
  // Full-width pages whose content uses the same `max-w-5xl` + padding box.
  default: "max-w-5xl",
  // The two-column home hero.
  wide: "max-w-6xl",
  // A single `max-w-md` card centered in a `px-4 sm:px-6` main.
  card: "max-w-[30rem] sm:max-w-[31rem]",
} as const;

export type PageWidth = keyof typeof PAGE_WIDTHS;
