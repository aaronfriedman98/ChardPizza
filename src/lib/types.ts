// Row types for the tables the app touches. Keep in sync with supabase/migrations.

export type AdminRole = "owner" | "manager" | "kitchen" | "handoff" | "driver";
export type CardFeeMode = "absorb" | "pass_through";

export interface AdminUser {
  id: string;
  display_name: string;
  email: string;
  role: AdminRole;
  is_partner: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Settings {
  id: true;
  business_name: string;
  business_phone: string | null;
  show_phone_publicly: boolean;
  business_email: string | null;
  pickup_address: string | null;
  pickup_instructions: string | null;
  time_zone: string;
  zelle_instructions: string | null;
  default_slot_minutes: number;
  default_slot_capacity: number;
  late_warning_minutes: number;
  late_critical_minutes: number;
  ready_uncollected_minutes: number;
  special_instructions_enabled: boolean;
  card_fee_mode: CardFeeMode;
  card_fee_percent: number;
  card_fee_flat_cents: number;
  msg_no_service: string;
  msg_upcoming: string;
  msg_paused: string;
  msg_sold_out: string;
  msg_closed: string;
  whatsapp_url: string | null;
  instagram_url: string | null;
  about_text: string | null;
  public_url: string;
  share_message_template: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  default_price_cents: number;
  capacity_units: number;
  photo_url: string | null;
  sku: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee_cents: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type ServiceStatus = "draft" | "scheduled" | "live" | "completed" | "cancelled" | "archived";
export type OrderingOverride = "auto" | "open" | "paused" | "closed";

export interface Service {
  id: string;
  name: string;
  service_date: string; // YYYY-MM-DD
  starts_at: string;
  ends_at: string;
  ordering_opens_at: string | null;
  ordering_closes_at: string | null;
  status: ServiceStatus;
  ordering_override: OrderingOverride;
  pizza_capacity_total: number;
  slot_minutes: number;
  default_slot_capacity: number;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  cash_enabled: boolean;
  zelle_enabled: boolean;
  card_enabled: boolean;
  allow_special_instructions: boolean;
  preorder_reserve_units: number | null;
  preorder_reserve_percent: number | null;
  customer_instructions: string | null;
  is_sold_out: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceMenuItem {
  id: string;
  service_id: string;
  menu_item_id: string;
  price_cents: number;
  description_override: string | null;
  is_available: boolean;
  quantity_limit: number | null;
  sold_out_manual: boolean;
  sort_order: number;
}

export interface ServiceTimeSlot {
  id: string;
  service_id: string;
  slot_start: string;
  slot_end: string;
  capacity_units: number;
  preorder_cap_units: number | null;
  is_blocked: boolean;
  sort_order: number;
}

export interface SlotAvailability extends ServiceTimeSlot {
  slot_id: string;
  units_sold: number;
  order_count: number;
  units_remaining: number;
}

export interface ServiceDeliveryZone {
  service_id: string;
  delivery_zone_id: string;
  fee_cents_override: number | null;
}

export interface ServiceAvailability {
  service_id: string;
  pizza_capacity_total: number;
  units_sold: number;
  units_wasted: number;
  units_remaining: number;
  order_count: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Expense {
  id: string;
  expense_date: string;
  amount_cents: number;
  category_id: string | null;
  vendor: string | null;
  description: string | null;
  receipt_url: string | null;
  service_id: string | null;
  paid_by: "business" | "partner";
  paid_by_admin_id: string | null;
  is_reimbursable: boolean;
  reimbursed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ServiceWaste {
  id: string;
  service_id: string;
  menu_item_id: string | null;
  item_name: string;
  units: number;
  reason: "burnt" | "dropped" | "eaten" | "given_away" | "other";
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AccountTransaction {
  id: string;
  txn_date: string;
  amount_cents: number;
  kind: "opening_balance" | "deposit" | "expense" | "reimbursement" | "partner_draw" | "adjustment" | "other";
  description: string | null;
  expense_id: string | null;
  partner_id: string | null;
  service_id: string | null;
  created_by: string | null;
  created_at: string;
}
