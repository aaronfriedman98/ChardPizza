// Checks the oven batching rule against Aaron's examples. Run: npx tsx scripts/test-batches.ts
import { buildBatches } from "../src/lib/batches";
import type { Order } from "../src/lib/orders";

let n = 0;
const mk = (slot: string, items: [string, number][], flags: Partial<Order> = {}): Order =>
  ({
    id: `o${++n}`,
    order_number: `CHAR-${1000 + n}`,
    customer_name: `Person ${n}`,
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

const TYPES = ["Char'd Pie", "Pizza Bianca"];
const S1 = "2026-01-01T19:00:00Z";
const S2 = "2026-01-01T19:15:00Z";
const show = (b: ReturnType<typeof buildBatches>) => b.map((x) => x.lines.map((l) => `${l.qty} ${l.name.split(" ")[0]}`).join(" + ")).join("  |  ");

let pass = 0, fail = 0;
function check(name: string, got: string, want: string) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      got:  ${got}\n      want: ${want}`);
}

// Example 1: (2 reg + 1 white) then (1 reg + 1 white) must stay separate.
check("mixed orders stay separate", show(buildBatches([mk(S1, [["Char'd Pie", 2], ["Pizza Bianca", 1]]), mk(S1, [["Char'd Pie", 1], ["Pizza Bianca", 1]])], TYPES)),
  "2 Char'd + 1 Pizza  |  1 Char'd + 1 Pizza");

// Example 2: (2 reg), (2 reg), (2 reg + 1 white) merge into 6 reg + 1 white.
check("same-type orders merge with a trailing mixed order", show(buildBatches([mk(S1, [["Char'd Pie", 2]]), mk(S1, [["Char'd Pie", 2]]), mk(S1, [["Char'd Pie", 2], ["Pizza Bianca", 1]])], TYPES)),
  "6 Char'd + 1 Pizza");

// Mixed order first, then a single-type order of the FIRST type: merging would delay the first person.
check("mixed then single reg stays separate", show(buildBatches([mk(S1, [["Char'd Pie", 2], ["Pizza Bianca", 1]]), mk(S1, [["Char'd Pie", 2]])], TYPES)),
  "2 Char'd + 1 Pizza  |  2 Char'd");

// Batches never cross slots.
check("slots are not merged", show(buildBatches([mk(S1, [["Char'd Pie", 2]]), mk(S2, [["Char'd Pie", 2]])], TYPES)),
  "2 Char'd  |  2 Char'd");

// Rush goes first within the slot.
const rushList = [mk(S1, [["Pizza Bianca", 1]]), mk(S1, [["Char'd Pie", 1]], { is_rush: true })];
check("rush first", buildBatches(rushList, TYPES)[0].orders[0].flags.join(), "RUSH");

// Two whites then two regs: pure single-type orders of different types can merge (nobody waits longer).
check("different single types merge when fair, in queue order", show(buildBatches([mk(S1, [["Pizza Bianca", 2]]), mk(S1, [["Char'd Pie", 2]])], TYPES)),
  "2 Pizza + 2 Char'd");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
