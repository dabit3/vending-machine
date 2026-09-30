// Numeric block values are dollar credits ("20" → "$20"); anything else
// ("Team plan", "$200") is shown as entered.
export function formatBlockValue(value: string): string {
  const trimmed = value.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}

function dollars(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// What a block's codes are worth to the admin. Stripe codes can redeem twice,
// so a "$200" code that redeems twice is worth $400 in total.
export function blockValueSummary(
  value: string,
  codeCount: number,
  twiceCount: number
): { headline: string; detail?: string } {
  const perRedemption = formatBlockValue(value);
  if (twiceCount === 0) return { headline: perRedemption };
  const trimmed = value.trim();
  const numeric = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
  const total = numeric === null ? null : dollars(numeric * 2);
  if (twiceCount >= codeCount) {
    return total === null
      ? { headline: perRedemption, detail: "Each code redeems twice" }
      : {
          headline: total,
          detail: `${perRedemption} × 2 redemptions per code`,
        };
  }
  return {
    headline: perRedemption,
    detail: `${twiceCount} of ${codeCount} codes redeem twice${total === null ? "" : ` (${total} each)`}`,
  };
}
