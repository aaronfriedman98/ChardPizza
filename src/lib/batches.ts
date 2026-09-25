import type { Order } from "@/lib/orders";
import { queueSort } from "@/lib/orders";

export type Batch = {
  slotStart: string;
  lines: { name: string; qty: number }[];
  orders: { id: string; name: string; number: string; flags: string[] }[];
};

type Line = { name: string; qty: number };

function linesOf(o: Order): Line[] {
  // Only pies count. Sides (capacity 0) are boxed, not baked in sequence.
  const m = new Map<string, number>();
  for (const it of o.order_items) if (Number(it.capacity_units_each) > 0) m.set(it.item_name, (m.get(it.item_name) ?? 0) + it.quantity);
  return Array.from(m, ([name, qty]) => ({ name, qty }));
}

/**
 * Would making these orders type-by-type (all of type 1, then all of type 2 ...)
 * finish any order later than making them one after another? If so, they must not share a batch.
 */
function mergeIsFair(orders: Line[][]): boolean {
  // Sequential: each order's pies in order; completion = running total.
  const seq: number[] = [];
  let pos = 0;
  for (const lines of orders) {
    pos += lines.reduce((a, l) => a + l.qty, 0);
    seq.push(pos);
  }
  // Grouped: for each type in menu order, each order's pies of that type, orders in queue order.
  const done = orders.map(() => 0);
  pos = 0;
  const types = Array.from(new Set(orders.flatMap((ls) => ls.map((l) => l.name))));
  for (const t of types) {
    orders.forEach((lines, i) => {
      const l = lines.find((x) => x.name === t);
      if (!l) return;
      pos += l.qty;
      done[i] = pos;
    });
  }
  return done.every((d, i) => d <= seq[i]);
}

/**
 * Turns the open queue into the sequence the oven should follow.
 * Batches never cross a time slot. Within a slot, orders are in queue order
 * (rush and "here" first) and merged only while the merge delays nobody.
 * Pie types inside a batch are listed in the order they first appear in the queue;
 * bake them in that order and every order finishes no later than one-at-a-time.
 */
export function buildBatches(orders: Order[], typeOrder: string[]): Batch[] {
  const open = orders.filter((o) => (o.status === "confirmed" || o.status === "making") && !o.is_on_hold).sort(queueSort);
  const bySlot = new Map<string, Order[]>();
  for (const o of open) bySlot.set(o.scheduled_at, [...(bySlot.get(o.scheduled_at) ?? []), o]);

  void typeOrder; // reserved: the bake order inside a batch follows the queue, see mergeIsFair
  const out: Batch[] = [];

  for (const [slotStart, list] of Array.from(bySlot.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    let current: Order[] = [];
    const flush = () => {
      if (!current.length) return;
      // Map keeps first-appearance order, which is the bake order the fairness check assumed.
      const totals = new Map<string, number>();
      for (const o of current) for (const l of linesOf(o)) totals.set(l.name, (totals.get(l.name) ?? 0) + l.qty);
      out.push({
        slotStart,
        lines: Array.from(totals, ([name, qty]) => ({ name, qty })),
        orders: current.map((o) => ({
          id: o.id,
          name: o.customer_name.split(/\s+/)[0] ?? o.customer_name,
          number: o.order_number,
          flags: [o.is_rush && "RUSH", o.customer_arrived && "HERE"].filter(Boolean) as string[],
        })),
      });
      current = [];
    };
    for (const o of list) {
      if (linesOf(o).length === 0) continue; // sides only: nothing to bake
      const candidate = [...current, o];
      if (current.length && !mergeIsFair(candidate.map(linesOf))) flush();
      current.push(o);
    }
    flush();
  }
  return out;
}
