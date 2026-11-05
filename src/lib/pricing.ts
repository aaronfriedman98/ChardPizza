import type { PriceTier } from "@/lib/types";
import { formatCents } from "@/lib/format";

/** What a pie costs under a tier: dollars off the menu price, or the tier's flat price. */
export function tierPrice(t: Pick<PriceTier, "pie_price_cents" | "discount_cents">, menuPriceCents: number) {
  return t.discount_cents != null ? Math.max(menuPriceCents - t.discount_cents, 0) : t.pie_price_cents;
}

/** "$5 off each pie" or "$20/pie". */
export function tierLabel(t: Pick<PriceTier, "pie_price_cents" | "discount_cents">) {
  return t.discount_cents != null ? `${formatCents(t.discount_cents)} off each pie` : `${formatCents(t.pie_price_cents)}/pie`;
}
