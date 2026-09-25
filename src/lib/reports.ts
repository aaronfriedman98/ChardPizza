import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUser, Expense, ExpenseCategory, Service } from "@/lib/types";
import type { Order } from "@/lib/orders";

type PaymentRow = { order_id: string; kind: "payment" | "refund"; method: string; amount_cents: number; status: string };

export interface ServiceReport {
  service: Service;
  orders: Order[];
  liveOrders: Order[];
  itemSales: number;
  deliveryFees: number;
  processingFees: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  collected: number;
  outstanding: number;
  expenses: Expense[];
  expenseTotal: number;
  profit: number;
  unitsSold: number;
  avgOrder: number;
  avgUnitsPerOrder: number;
  pickupCount: number;
  deliveryCount: number;
  byPaymentMethod: { method: string; count: number; cents: number }[];
  items: { name: string; qty: number; cents: number }[];
  bySlot: { time: string; units: number; orders: number; capacity: number }[];
  preorderCount: number;
  liveCount: number;
  newCustomers: number;
  returningCustomers: number;
  avgMinutesLate: number | null;
  lateCount: number;
  soldOutAt: string | null;
  sourceCounts: { source: string; count: number }[];
}

export async function serviceReport(supabase: SupabaseClient, service: Service): Promise<ServiceReport> {
  const [{ data: orderRows }, { data: paymentRows }, { data: expenseRows }, { data: slotRows }] = await Promise.all([
    supabase.from("orders").select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each)").eq("service_id", service.id).order("created_at"),
    supabase.from("payments").select("order_id, kind, method, amount_cents, status, orders!inner(service_id)").eq("orders.service_id", service.id),
    supabase.from("expenses").select("*").eq("service_id", service.id).is("deleted_at", null),
    supabase.from("service_time_slots").select("slot_start, capacity_units").eq("service_id", service.id).order("slot_start"),
  ]);
  const orders = (orderRows ?? []) as Order[];
  const live = orders.filter((o) => o.status !== "cancelled" && o.status !== "pending_payment");
  const payments = (paymentRows ?? []) as unknown as PaymentRow[];
  const expenses = (expenseRows ?? []) as Expense[];

  const itemSales = live.reduce((a, o) => a + o.subtotal_cents, 0);
  const deliveryFees = live.reduce((a, o) => a + o.delivery_fee_cents, 0);
  const processingFees = live.reduce((a, o) => a + o.processing_fee_cents, 0);
  const grossSales = itemSales + deliveryFees + processingFees;
  const refunds = payments.filter((p) => p.kind === "refund" && p.status !== "failed").reduce((a, p) => a + p.amount_cents, 0);
  const collected = payments.filter((p) => p.status !== "failed").reduce((a, p) => a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents), 0);
  const netSales = grossSales - refunds;
  const expenseTotal = expenses.reduce((a, e) => a + e.amount_cents, 0);

  const itemMap = new Map<string, { qty: number; cents: number }>();
  for (const o of live) for (const it of o.order_items) {
    const cur = itemMap.get(it.item_name) ?? { qty: 0, cents: 0 };
    itemMap.set(it.item_name, { qty: cur.qty + it.quantity, cents: cur.cents + it.line_total_cents });
  }

  const payMap = new Map<string, { count: number; cents: number }>();
  for (const o of live) {
    const cur = payMap.get(o.payment_method) ?? { count: 0, cents: 0 };
    payMap.set(o.payment_method, { count: cur.count + 1, cents: cur.cents + o.total_cents });
  }

  const slotMap = new Map<string, { units: number; orders: number; capacity: number }>();
  for (const s of (slotRows ?? []) as { slot_start: string; capacity_units: number }[]) slotMap.set(s.slot_start, { units: 0, orders: 0, capacity: s.capacity_units });
  for (const o of live) {
    const cur = slotMap.get(o.scheduled_at) ?? { units: 0, orders: 0, capacity: 0 };
    slotMap.set(o.scheduled_at, { ...cur, units: cur.units + Number(o.capacity_units), orders: cur.orders + 1 });
  }

  const startsAt = new Date(service.starts_at);
  const preorderCount = live.filter((o) => new Date(o.created_at) < startsAt).length;

  // New vs returning: a customer is "returning" if they had an earlier live order on another service.
  const customerIds = Array.from(new Set(live.map((o) => o.customer_id)));
  let returning = 0;
  if (customerIds.length) {
    const { data: earlier } = await supabase
      .from("orders")
      .select("customer_id")
      .in("customer_id", customerIds)
      .neq("service_id", service.id)
      .neq("status", "cancelled")
      .lt("created_at", service.starts_at);
    returning = new Set((earlier ?? []).map((r) => r.customer_id)).size;
  }

  const lateness = live.filter((o) => o.ready_at).map((o) => (new Date(o.ready_at!).getTime() - new Date(o.scheduled_at).getTime()) / 60000);
  const lateOnes = lateness.filter((m) => m > 0);

  // Sold out moment: when cumulative units reached the total.
  let soldOutAt: string | null = null;
  if (service.pizza_capacity_total > 0) {
    let cum = 0;
    for (const o of live) {
      cum += Number(o.capacity_units);
      if (cum >= service.pizza_capacity_total) {
        soldOutAt = o.created_at;
        break;
      }
    }
  }

  const srcMap = new Map<string, number>();
  for (const o of live) srcMap.set(o.source, (srcMap.get(o.source) ?? 0) + 1);

  return {
    service,
    orders,
    liveOrders: live,
    itemSales,
    deliveryFees,
    processingFees,
    grossSales,
    refunds,
    netSales,
    collected,
    outstanding: Math.max(netSales - collected, 0),
    expenses,
    expenseTotal,
    profit: netSales - expenseTotal,
    unitsSold: live.reduce((a, o) => a + Number(o.capacity_units), 0),
    avgOrder: live.length ? Math.round(grossSales / live.length) : 0,
    avgUnitsPerOrder: live.length ? Math.round((live.reduce((a, o) => a + Number(o.capacity_units), 0) / live.length) * 10) / 10 : 0,
    pickupCount: live.filter((o) => o.fulfillment === "pickup").length,
    deliveryCount: live.filter((o) => o.fulfillment === "delivery").length,
    byPaymentMethod: Array.from(payMap, ([method, v]) => ({ method, ...v })),
    items: Array.from(itemMap, ([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty),
    bySlot: Array.from(slotMap, ([time, v]) => ({ time, ...v })).sort((a, b) => a.time.localeCompare(b.time)),
    preorderCount,
    liveCount: live.length - preorderCount,
    newCustomers: customerIds.length - returning,
    returningCustomers: returning,
    avgMinutesLate: lateOnes.length ? Math.round(lateOnes.reduce((a, b) => a + b, 0) / lateOnes.length) : lateness.length ? 0 : null,
    lateCount: lateOnes.length,
    soldOutAt,
    sourceCounts: Array.from(srcMap, ([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

export interface PartnerLine {
  admin: Pick<AdminUser, "id" | "display_name">;
  paidOutOfPocket: number;
  reimbursable: number;
  reimbursed: number;
  owed: number;
}

export function partnerLedger(expenses: Expense[], partners: Pick<AdminUser, "id" | "display_name">[]): PartnerLine[] {
  return partners.map((p) => {
    const mine = expenses.filter((e) => e.paid_by === "partner" && e.paid_by_admin_id === p.id);
    const paidOutOfPocket = mine.reduce((a, e) => a + e.amount_cents, 0);
    const reimbursable = mine.filter((e) => e.is_reimbursable).reduce((a, e) => a + e.amount_cents, 0);
    const reimbursed = mine.filter((e) => e.is_reimbursable && e.reimbursed_at).reduce((a, e) => a + e.amount_cents, 0);
    return { admin: p, paidOutOfPocket, reimbursable, reimbursed, owed: reimbursable - reimbursed };
  });
}

export function categoryTotals(expenses: Expense[], categories: ExpenseCategory[]) {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.category_id ?? "none", (m.get(e.category_id ?? "none") ?? 0) + e.amount_cents);
  const name = new Map(categories.map((c) => [c.id, c.name]));
  return Array.from(m, ([id, cents]) => ({ name: name.get(id) ?? "Uncategorized", cents })).sort((a, b) => b.cents - a.cents);
}
