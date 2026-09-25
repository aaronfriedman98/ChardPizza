import type { Order } from "@/lib/orders";
import { queueSort } from "@/lib/orders";

/** One step for the oven: make `qty` of `name`. */
export type Run = {
  slotStart: string;
  name: string;
  qty: number;
  /** Which orders these pies belong to. */
  parts: { orderId: string; customer: string; qty: number; flags: string[] }[];
  /** Orders that are fully baked once this run is done. */
  completes: string[];
};

type Line = { name: string; qty: number };

function linesOf(o: Order): Line[] {
  // Only pies count. Sides (capacity 0) are boxed, not baked.
  const m = new Map<string, number>();
  for (const it of o.order_items) if (Number(it.capacity_units_each) > 0) m.set(it.item_name, (m.get(it.item_name) ?? 0) + it.quantity);
  return Array.from(m, ([name, qty]) => ({ name, qty }));
}

type Piece = { type: string; qty: number; order: number };

/** Position at which each order's last pie comes out, given a sequence of pieces. */
function completions(seq: Piece[], orderCount: number): number[] {
  const done = new Array<number>(orderCount).fill(0);
  let pos = 0;
  for (const p of seq) {
    pos += p.qty;
    done[p.order] = pos;
  }
  return done;
}

/**
 * The rule: start from "one order at a time". Then, for each pie run, try to pull it
 * earlier to sit right after the most recent run of the same type. Keep the move only
 * if no order finishes later than it would have one-at-a-time.
 *
 * (2 reg + 1 white) then (1 reg + 1 white) becomes 2 reg, 2 white, 1 reg: the whites
 * batch, and both customers still finish at pie 3 and pie 5.
 */
function sequenceSlot(orders: Order[]): Piece[] {
  const lines = orders.map(linesOf);
  const naive: Piece[] = [];
  lines.forEach((ls, i) => ls.forEach((l) => naive.push({ type: l.name, qty: l.qty, order: i })));
  const target = completions(naive, orders.length);

  const seq: Piece[] = [];
  for (const piece of naive) {
    let lastSame = -1;
    for (let k = seq.length - 1; k >= 0; k--) if (seq[k].type === piece.type) { lastSame = k; break; }
    if (lastSame >= 0 && lastSame < seq.length - 1) {
      const trial = [...seq.slice(0, lastSame + 1), piece, ...seq.slice(lastSame + 1)];
      const done = completions(trial, orders.length);
      if (done.every((d, i) => d <= target[i])) {
        seq.splice(lastSame + 1, 0, piece);
        continue;
      }
    }
    seq.push(piece);
  }
  return seq;
}

/**
 * Turns the open queue into the exact sequence the oven should follow.
 * Slots are never mixed. Within a slot, orders are in queue order (rush and "here" first).
 */
export function buildRuns(orders: Order[]): Run[] {
  const open = orders.filter((o) => (o.status === "confirmed" || o.status === "making") && !o.is_on_hold && linesOf(o).length > 0).sort(queueSort);
  const bySlot = new Map<string, Order[]>();
  for (const o of open) bySlot.set(o.scheduled_at, [...(bySlot.get(o.scheduled_at) ?? []), o]);

  const out: Run[] = [];
  for (const [slotStart, list] of Array.from(bySlot.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const seq = sequenceSlot(list);
    const remaining = list.map((o) => linesOf(o).reduce((a, l) => a + l.qty, 0));
    const first = (o: Order) => o.customer_name.split(/\s+/)[0] ?? o.customer_name;
    const flags = (o: Order) => [o.is_rush && "RUSH", o.customer_arrived && "HERE"].filter(Boolean) as string[];

    let current: Run | null = null;
    for (const p of seq) {
      const o = list[p.order];
      if (!current || current.name !== p.type) {
        current = { slotStart, name: p.type, qty: 0, parts: [], completes: [] };
        out.push(current);
      }
      current.qty += p.qty;
      current.parts.push({ orderId: o.id, customer: first(o), qty: p.qty, flags: flags(o) });
      remaining[p.order] -= p.qty;
      if (remaining[p.order] === 0) current.completes.push(first(o));
    }
  }
  return out;
}

/** @deprecated kept for older imports; use buildRuns. */
export const buildBatches = (orders: Order[]) =>
  buildRuns(orders).map((r) => ({ slotStart: r.slotStart, lines: [{ name: r.name, qty: r.qty }], orders: r.parts.map((p) => ({ id: p.orderId, name: p.customer, number: "", flags: p.flags })) }));
