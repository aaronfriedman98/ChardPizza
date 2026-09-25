import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "@/lib/types";

export type OrderStatus = "pending_payment" | "confirmed" | "making" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "awaiting_payment" | "due_at_pickup" | "paid" | "partially_refunded" | "refunded";
export type PaymentMethod = "cash" | "zelle" | "card";

export interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  capacity_units_each: number;
}

export interface Order {
  id: string;
  order_number: string;
  service_id: string;
  customer_id: string;
  fulfillment: "pickup" | "delivery";
  time_slot_id: string | null;
  scheduled_at: string;
  status: OrderStatus;
  production_priority: number;
  is_rush: boolean;
  is_on_hold: boolean;
  customer_arrived: boolean;
  delivery_zone_name: string | null;
  delivery_fee_cents: number;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_notes: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  subtotal_cents: number;
  processing_fee_cents: number;
  total_cents: number;
  capacity_units: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  special_instructions: string | null;
  source: string;
  created_by_admin_id: string | null;
  started_at: string | null;
  ready_at: string | null;
  out_for_delivery_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  order_items: OrderItem[];
}

export const ACTIVE: OrderStatus[] = ["confirmed", "making", "ready", "out_for_delivery"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Scheduled",
  making: "Making",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Done",
  cancelled: "Cancelled",
};

export const PAY_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  awaiting_payment: "Awaiting Zelle",
  due_at_pickup: "Cash due",
  paid: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
};

export async function loadServiceOrders(supabase: SupabaseClient, serviceId: string): Promise<Order[]> {
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each)")
    .eq("service_id", serviceId)
    .order("scheduled_at")
    .order("created_at");
  return (data ?? []) as Order[];
}

/** Kitchen order: rush first, then customers who are here, then production priority, then who ordered first. */
export function queueSort(a: Order, b: Order) {
  if (a.is_on_hold !== b.is_on_hold) return a.is_on_hold ? 1 : -1;
  if (a.is_rush !== b.is_rush) return a.is_rush ? -1 : 1;
  if (a.customer_arrived !== b.customer_arrived) return a.customer_arrived ? -1 : 1;
  if (a.production_priority !== b.production_priority) return a.production_priority - b.production_priority;
  return a.created_at.localeCompare(b.created_at);
}

export function minutesSince(iso: string | null, now: Date) {
  if (!iso) return 0;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
}

/** Minutes past the scheduled time with the food not yet ready. 0 when not late. */
export function minutesBehind(o: Order, now: Date) {
  if (o.status !== "confirmed" && o.status !== "making") return 0;
  return Math.max(minutesSince(o.scheduled_at, now), 0);
}

/** Minutes a pickup order has been sitting ready. 0 when not ready. */
export function minutesReady(o: Order, now: Date) {
  if (o.status !== "ready") return 0;
  return Math.max(minutesSince(o.ready_at, now), 0);
}

export type Urgency = "none" | "warn" | "critical";

export function urgency(o: Order, now: Date, s: Pick<Settings, "late_warning_minutes" | "late_critical_minutes" | "ready_uncollected_minutes">): Urgency {
  const behind = minutesBehind(o, now);
  if (behind >= s.late_critical_minutes && behind > 0) return "critical";
  if (behind >= s.late_warning_minutes && behind > 0) return "warn";
  const ready = minutesReady(o, now);
  if (ready >= s.ready_uncollected_minutes * 2 && ready > 0) return "critical";
  if (ready >= s.ready_uncollected_minutes && ready > 0) return "warn";
  return "none";
}

export function tallyItems(orders: Order[]): { name: string; qty: number }[] {
  const m = new Map<string, number>();
  for (const o of orders) for (const it of o.order_items) m.set(it.item_name, (m.get(it.item_name) ?? 0) + it.quantity);
  return Array.from(m, ([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
}

export function itemSummary(o: Order) {
  return o.order_items.map((it) => `${it.quantity}× ${it.item_name}`).join(", ");
}

export function firstName(o: Order) {
  return o.customer_name.trim().split(/\s+/)[0] ?? o.customer_name;
}
