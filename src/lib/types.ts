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
