// Numeric block values are dollar credits ("20" → "$20"); anything else
// ("Team plan", "$200") is shown as entered.
export function formatBlockValue(value: string): string {
  const trimmed = value.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}

function dollars(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export type CodeTerms = { redemptions: number; months: number };

function termsPhrase(perRedemption: string, { redemptions, months }: CodeTerms) {
  const perCode =
    redemptions > 1 ? `${perRedemption} × ${redemptions} redemptions per code` : null;
  if (months <= 1) return perCode!;
  return perCode
    ? `${perCode}, each for ${months} months`
    : `${perRedemption} a month for ${months} months`;
}

function partialPhrase({ redemptions, months }: CodeTerms, single = false) {
  const redeem = single ? "redeems" : "redeem";
  if (months <= 1) return `${redeem} twice`;
  return redemptions > 1
    ? `${redeem} twice for ${months} months each`
    : `${single ? "applies" : "apply"} for ${months} months`;
}

// What a block's codes are worth to the admin. Stripe codes can redeem twice
// and repeat monthly, so a "$200" code that redeems twice is worth $400, and
// one that applies for 2 months is worth up to $400 on a subscription.
// `terms` lists only codes that redeem more than once or repeat.
export function blockTermsSummary(
  value: string,
  codeCount: number,
  terms: CodeTerms[]
): { headline: string; detail?: string } {
  const perRedemption = formatBlockValue(value);
  if (terms.length === 0) return { headline: perRedemption };
  const kinds = new Map(terms.map((t) => [`${t.redemptions}x${t.months}`, t]));
  if (kinds.size > 1)
    return { headline: perRedemption, detail: "Codes in this block have different terms" };
  const [term] = kinds.values();
  const trimmed = value.trim();
  const numeric = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
  const total =
    numeric === null ? null : dollars(numeric * term.redemptions * term.months);
  if (terms.length >= codeCount) {
    if (total !== null)
      return { headline: total, detail: termsPhrase(perRedemption, term) };
    return { headline: perRedemption, detail: `Each code ${partialPhrase(term, true)}` };
  }
  return {
    headline: perRedemption,
    detail: `${terms.length} of ${codeCount} codes ${partialPhrase(term)}${total === null ? "" : ` (${total} each)`}`,
  };
}

export function blockValueSummary(
  value: string,
  codeCount: number,
  twiceCount: number
): { headline: string; detail?: string } {
  return blockTermsSummary(
    value,
    codeCount,
    Array.from({ length: twiceCount }, () => ({ redemptions: 2, months: 1 }))
  );
}
