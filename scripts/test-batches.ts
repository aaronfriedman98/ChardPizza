// Checks the oven sequencing rule against Aaron's examples. Run: npx tsx scripts/test-batches.ts
import { buildRuns } from "../src/lib/batches";
import type { Order } from "../src/lib/orders";

let n = 0;
const mk = (slot: string, items: [string, number][], flags: Partial<Order> = {}): Order =>
  ({
    id: `o${++n}`,
    order_number: `CHAR-${1000 + n}`,
    customer_name: `P${n}`,
    scheduled_at: slot,
    status: "confirmed",
    production_priority: n,
    is_rush: false,
    is_on_hold: false,
    customer_arrived: false,
    created_at: new Date(2026, 0, 1, 0, n).toISOString(),
    order_items: items.map(([name, qty], i) => ({ id: `i${n}-${i}`, item_name: name, quantity: qty, unit_price_cents: 2500, line_total_cents: 2500 * qty, capacity_units_each: 1 })),
    ...flags,
  }) as unknown as Order;

const R = "Reg";
const W = "White";
const S1 = "2026-01-01T19:00:00Z";
const S2 = "2026-01-01T19:15:00Z";
const show = (orders: Order[]) => buildRuns(orders).map((r) => `${r.qty} ${r.name}`).join(", ");

let pass = 0, fail = 0;
function check(name: string, got: string, want: string) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      got:  ${got}\n      want: ${want}`);
}

// Example 1: (2 reg + 1 white) then (1 reg + 1 white) -> 2 reg, 2 white, 1 reg.
check("whites batch, nobody delayed", show([mk(S1, [[R, 2], [W, 1]]), mk(S1, [[R, 1], [W, 1]])]), "2 Reg, 2 White, 1 Reg");

// Example 2: (2 reg), (2 reg), (2 reg + 1 white) -> 6 reg, 1 white.
check("single-type orders merge", show([mk(S1, [[R, 2]]), mk(S1, [[R, 2]]), mk(S1, [[R, 2], [W, 1]])]), "6 Reg, 1 White");

// Mixed first, then a single reg: pulling the reg forward would delay the first person.
check("later reg does not jump a waiting white", show([mk(S1, [[R, 2], [W, 1]]), mk(S1, [[R, 2]])]), "2 Reg, 1 White, 2 Reg");

// Slots stay separate even when the type matches.
check("slots are not merged", show([mk(S1, [[R, 2]]), mk(S2, [[R, 2]])]), "2 Reg, 2 Reg");

// Rush goes first within a slot.
check("rush first", buildRuns([mk(S1, [[W, 1]]), mk(S1, [[R, 1]], { is_rush: true })])[0].name, R);

// White then reg, both single-type: nothing to batch, keep queue order.
check("different single types keep queue order", show([mk(S1, [[W, 2]]), mk(S1, [[R, 2]])]), "2 White, 2 Reg");

// Completion markers: in example 1, P1 is done after the white run, P2 after the last reg.
const runs = buildRuns([mk(S1, [[R, 2], [W, 1]]), mk(S1, [[R, 1], [W, 1]])]);
const [a, b] = runs.flatMap((r) => r.completes);
check("completion markers", runs.map((r) => r.completes.join("+") || "-").join(" | "), `- | ${a} | ${b}`);

// Sides-only orders never appear.
check("sides are not baked", show([mk(S1, [["Soup", 2]].map(([a, b]) => [a as string, b as number]) as [string, number][])].map((o) => ({ ...o, order_items: o.order_items.map((it) => ({ ...it, capacity_units_each: 0 })) })) as Order[]), "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
