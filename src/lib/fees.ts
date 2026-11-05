import type { Settings } from "@/lib/types";

type FeeSettings = Pick<Settings, "card_fee_mode" | "card_fee_percent" | "card_fee_flat_cents">;

/** What a customer pays extra for using a card, on top of pies + delivery. Zero when Char'd absorbs it. */
export function cardFeeCents(baseCents: number, s: FeeSettings): number {
  if (s.card_fee_mode !== "pass_through" || baseCents <= 0) return 0;
  return Math.round((baseCents * Number(s.card_fee_percent)) / 100) + Number(s.card_fee_flat_cents);
}

/** "3% card fee" / "3% + 30¢ card fee" for labels. */
export function cardFeeLabel(s: FeeSettings): string {
  const pct = Number(s.card_fee_percent);
  const flat = Number(s.card_fee_flat_cents);
  const pctText = pct ? `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%` : "";
  const flatText = flat ? `${flat}¢` : "";
  return `${[pctText, flatText].filter(Boolean).join(" + ")} card fee`;
}
