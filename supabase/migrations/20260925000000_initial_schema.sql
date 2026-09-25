-- Char'd Pizza — initial schema
-- Money is integer cents. All timestamps are timestamptz (UTC). Business time zone lives in settings.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type admin_role as enum ('owner', 'manager', 'kitchen', 'handoff', 'driver');
create type service_status as enum ('draft', 'scheduled', 'live', 'completed', 'cancelled', 'archived');
create type ordering_override as enum ('auto', 'open', 'paused', 'closed');
create type fulfillment_type as enum ('pickup', 'delivery');
create type order_status as enum ('pending_payment', 'confirmed', 'making', 'ready', 'out_for_delivery', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'zelle', 'card');
create type payment_status as enum ('unpaid', 'awaiting_payment', 'due_at_pickup', 'paid', 'partially_refunded', 'refunded');
create type payment_kind as enum ('payment', 'refund');
create type payment_record_status as enum ('recorded', 'pending', 'succeeded', 'failed');
create type payment_provider as enum ('manual', 'stripe');
create type notification_channel as enum ('email', 'sms');
create type notification_status as enum ('queued', 'sent', 'delivered', 'failed');
create type paid_by_type as enum ('business', 'partner');
create type card_fee_mode as enum ('absorb', 'pass_through');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- People and configuration
-- ---------------------------------------------------------------------------
create table admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  role admin_role not null default 'owner',
  is_partner boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger admin_users_updated before update on admin_users for each row execute function set_updated_at();

-- Every auth user gets an admin profile. Public sign-up is disabled in the
-- Supabase dashboard, so only users we create by hand ever land here.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into admin_users (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_auth_user();

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_users where id = auth.uid() and is_active
  );
$$;

create table settings (
  id boolean primary key default true check (id), -- single row
  business_name text not null default 'Char''d Pizza',
  business_phone text,
  business_email text,
  pickup_address text,
  pickup_instructions text,
  time_zone text not null default 'America/Detroit',
  zelle_instructions text,
  default_slot_minutes int not null default 15 check (default_slot_minutes > 0),
  default_slot_capacity int not null default 5 check (default_slot_capacity >= 0),
  late_warning_minutes int not null default 5,
  late_critical_minutes int not null default 15,
  ready_uncollected_minutes int not null default 15,
  special_instructions_enabled boolean not null default true,
  card_fee_mode card_fee_mode not null default 'absorb',
  card_fee_percent numeric(5,2) not null default 0,
  card_fee_flat_cents int not null default 0,
  msg_no_service text not null default 'Nothing cooking right now. Check back soon.',
  msg_upcoming text not null default 'Next Char''d: {{service_date}}. Ordering opens {{opens_at}}.',
  msg_paused text not null default 'Ordering is temporarily paused. Check back in a few minutes.',
  msg_sold_out text not null default 'Sold out for tonight. Thank you!',
  msg_closed text not null default 'Ordering is closed for this sale.',
  whatsapp_url text,
  instagram_url text,
  about_text text,
  updated_at timestamptz not null default now()
);
create trigger settings_updated before update on settings for each row execute function set_updated_at();
insert into settings (id) values (true);

create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique, -- E.164, e.g. +12485551234
  email text,
  notes text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count int not null default 0,
  lifetime_spend_cents int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_email_idx on customers (lower(email));
create index customers_name_idx on customers (lower(full_name));
create trigger customers_updated before update on customers for each row execute function set_updated_at();

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee_cents int not null default 0 check (fee_cents >= 0),
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger delivery_zones_updated before update on delivery_zones for each row execute function set_updated_at();

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  line1 text not null,
  line2 text,
  city text,
  delivery_zone_id uuid references delivery_zones (id) on delete set null,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_addresses_customer_idx on customer_addresses (customer_id);

-- ---------------------------------------------------------------------------
-- Menu library
-- ---------------------------------------------------------------------------
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'Pizza',
  default_price_cents int not null check (default_price_cents >= 0),
  capacity_units numeric(6,2) not null default 1 check (capacity_units >= 0),
  photo_url text,
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger menu_items_updated before update on menu_items for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Services (a sale night)
-- ---------------------------------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ordering_opens_at timestamptz,
  ordering_closes_at timestamptz,
  status service_status not null default 'draft',
  ordering_override ordering_override not null default 'auto',
  pizza_capacity_total int not null default 0 check (pizza_capacity_total >= 0),
  slot_minutes int not null default 15 check (slot_minutes > 0),
  default_slot_capacity int not null default 5 check (default_slot_capacity >= 0),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  cash_enabled boolean not null default true,
  zelle_enabled boolean not null default true,
  card_enabled boolean not null default false,
  allow_special_instructions boolean not null default true,
  preorder_reserve_units int check (preorder_reserve_units is null or preorder_reserve_units >= 0),
  preorder_reserve_percent int check (preorder_reserve_percent is null or (preorder_reserve_percent between 0 and 100)),
  customer_instructions text,
  is_sold_out boolean not null default false,
  notes text,
  created_by uuid references admin_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index services_date_idx on services (service_date desc);
create index services_status_idx on services (status);
create trigger services_updated before update on services for each row execute function set_updated_at();

create table service_menu_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  menu_item_id uuid not null references menu_items (id) on delete restrict,
  price_cents int not null check (price_cents >= 0),
  description_override text,
  is_available boolean not null default true,
  quantity_limit int check (quantity_limit is null or quantity_limit >= 0),
  sold_out_manual boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, menu_item_id)
);
create index service_menu_items_service_idx on service_menu_items (service_id);
create trigger service_menu_items_updated before update on service_menu_items for each row execute function set_updated_at();

create table service_time_slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  capacity_units int not null default 0 check (capacity_units >= 0),
  preorder_cap_units int check (preorder_cap_units is null or preorder_cap_units >= 0),
  is_blocked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, slot_start),
  check (slot_end > slot_start)
);
create index service_time_slots_service_idx on service_time_slots (service_id, slot_start);
create trigger service_time_slots_updated before update on service_time_slots for each row execute function set_updated_at();

create table service_delivery_zones (
  service_id uuid not null references services (id) on delete cascade,
  delivery_zone_id uuid not null references delivery_zones (id) on delete cascade,
  fee_cents_override int check (fee_cents_override is null or fee_cents_override >= 0),
  primary key (service_id, delivery_zone_id)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence order_number_seq start 1000;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('CHAR-' || nextval('order_number_seq')),
  service_id uuid not null references services (id) on delete restrict,
  customer_id uuid not null references customers (id) on delete restrict,
  fulfillment fulfillment_type not null,
  time_slot_id uuid references service_time_slots (id) on delete restrict,
  scheduled_at timestamptz not null,
  status order_status not null default 'confirmed',
  production_priority int not null default 0,
  is_rush boolean not null default false,
  is_on_hold boolean not null default false,
  customer_arrived boolean not null default false,
  -- delivery snapshot
  delivery_zone_id uuid references delivery_zones (id) on delete set null,
  delivery_zone_name text,
  delivery_fee_cents int not null default 0 check (delivery_fee_cents >= 0),
  address_line1 text,
  address_line2 text,
  address_city text,
  address_notes text,
  -- customer snapshot
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  -- money
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  processing_fee_cents int not null default 0 check (processing_fee_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  capacity_units numeric(8,2) not null default 0 check (capacity_units >= 0),
  payment_method payment_method not null,
  payment_status payment_status not null default 'unpaid',
  special_instructions text,
  source text not null default 'website',
  referral text,
  created_by_admin_id uuid references admin_users (id),
  capacity_override boolean not null default false,
  confirmation_token text not null default encode(gen_random_bytes(16), 'hex'),
  -- lifecycle timestamps (set automatically by status changes)
  started_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fulfillment <> 'delivery' or address_line1 is not null)
);
create index orders_service_idx on orders (service_id, status);
create index orders_customer_idx on orders (customer_id);
create index orders_slot_idx on orders (time_slot_id);
create index orders_phone_idx on orders (customer_phone);
create index orders_expires_idx on orders (expires_at) where status = 'pending_payment';
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  service_menu_item_id uuid references service_menu_items (id) on delete set null,
  menu_item_id uuid references menu_items (id) on delete set null,
  item_name text not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  quantity int not null check (quantity > 0),
  capacity_units_each numeric(6,2) not null default 0,
  line_total_cents int not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);
create index order_items_smi_idx on order_items (service_menu_item_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid references admin_users (id),
  changed_at timestamptz not null default now(),
  note text
);
create index order_status_history_order_idx on order_status_history (order_id, changed_at);

-- Status changes stamp the matching timestamp and write history automatically.
create or replace function on_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, new.created_by_admin_id);
    return new;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'making' then new.started_at = coalesce(new.started_at, now());
      when 'ready' then new.ready_at = coalesce(new.ready_at, now());
      when 'out_for_delivery' then new.out_for_delivery_at = coalesce(new.out_for_delivery_at, now());
      when 'completed' then new.completed_at = coalesce(new.completed_at, now());
      when 'cancelled' then new.cancelled_at = coalesce(new.cancelled_at, now());
      else null;
    end case;
    insert into order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger orders_status_change before update on orders for each row execute function on_order_status_change();
create trigger orders_status_insert after insert on orders for each row execute function on_order_status_change();

create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  body text not null,
  is_customer_facing boolean not null default false,
  created_by uuid references admin_users (id),
  created_at timestamptz not null default now()
);
create index order_notes_order_idx on order_notes (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  kind payment_kind not null default 'payment',
  method payment_method not null,
  amount_cents int not null check (amount_cents > 0),
  status payment_record_status not null default 'recorded',
  provider payment_provider not null default 'manual',
  provider_reference text,
  recorded_by uuid references admin_users (id),
  recorded_at timestamptz not null default now(),
  note text
);
create index payments_order_idx on payments (order_id);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------
create table notification_templates (
  key text primary key,
  name text not null,
  channel notification_channel not null,
  subject text,
  body text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger notification_templates_updated before update on notification_templates for each row execute function set_updated_at();

create table notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  channel notification_channel not null,
  template_key text references notification_templates (key) on delete set null,
  recipient text not null,
  subject text,
  rendered_body text not null,
  status notification_status not null default 'queued',
  provider_message_id text,
  error text,
  sent_by uuid references admin_users (id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_order_idx on notifications (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  amount_cents int not null check (amount_cents > 0),
  category_id uuid references expense_categories (id) on delete set null,
  vendor text,
  description text,
  receipt_url text,
  service_id uuid references services (id) on delete set null,
  paid_by paid_by_type not null default 'business',
  paid_by_admin_id uuid references admin_users (id),
  is_reimbursable boolean not null default false,
  reimbursed_at timestamptz,
  notes text,
  created_by uuid references admin_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_by <> 'partner' or paid_by_admin_id is not null)
);
create index expenses_date_idx on expenses (expense_date desc);
create index expenses_service_idx on expenses (service_id);
create trigger expenses_updated before update on expenses for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references admin_users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_created_idx on audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Availability views. Capacity is never a stored counter: it is always
-- computed from live (non-cancelled) orders.
-- ---------------------------------------------------------------------------
create or replace view slot_availability as
select
  s.id as slot_id,
  s.service_id,
  s.slot_start,
  s.slot_end,
  s.capacity_units,
  s.preorder_cap_units,
  s.is_blocked,
  s.sort_order,
  coalesce(sum(o.capacity_units) filter (where o.status <> 'cancelled'), 0)::numeric as units_sold,
  count(o.id) filter (where o.status <> 'cancelled') as order_count,
  greatest(s.capacity_units - coalesce(sum(o.capacity_units) filter (where o.status <> 'cancelled'), 0), 0)::numeric as units_remaining
from service_time_slots s
left join orders o on o.time_slot_id = s.id
group by s.id;

create or replace view service_availability as
select
  sv.id as service_id,
  sv.pizza_capacity_total,
  coalesce((select sum(o.capacity_units) from orders o where o.service_id = sv.id and o.status <> 'cancelled'), 0)::numeric as units_sold,
  greatest(sv.pizza_capacity_total - coalesce((select sum(o.capacity_units) from orders o where o.service_id = sv.id and o.status <> 'cancelled'), 0), 0)::numeric as units_remaining,
  (select count(*) from orders o where o.service_id = sv.id and o.status <> 'cancelled') as order_count
from services sv;

create or replace view service_item_availability as
select
  smi.id as service_menu_item_id,
  smi.service_id,
  smi.menu_item_id,
  smi.quantity_limit,
  smi.sold_out_manual,
  smi.is_available,
  coalesce(sum(oi.quantity) filter (where o.status <> 'cancelled'), 0)::int as quantity_sold,
  case
    when smi.quantity_limit is null then null
    else greatest(smi.quantity_limit - coalesce(sum(oi.quantity) filter (where o.status <> 'cancelled'), 0), 0)::int
  end as quantity_remaining,
  (not smi.is_available)
    or smi.sold_out_manual
    or (smi.quantity_limit is not null and coalesce(sum(oi.quantity) filter (where o.status <> 'cancelled'), 0) >= smi.quantity_limit) as is_sold_out
from service_menu_items smi
left join order_items oi on oi.service_menu_item_id = smi.id
left join orders o on o.id = oi.order_id
group by smi.id;

-- ---------------------------------------------------------------------------
-- Grants and Row Level Security
-- Customers never touch the database directly; public pages and checkout run
-- on the server with the secret key. Admins use the authenticated role.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Nobody edits the ledger or the audit trail, not even admins.
drop policy admin_all on payments;
create policy admin_read on payments for select to authenticated using (is_admin());
create policy admin_insert on payments for insert to authenticated with check (is_admin());
drop policy admin_all on audit_log;
create policy admin_read on audit_log for select to authenticated using (is_admin());
create policy admin_insert on audit_log for insert to authenticated with check (is_admin());
drop policy admin_all on order_status_history;
create policy admin_read on order_status_history for select to authenticated using (is_admin());

-- Realtime for the live service board.
alter publication supabase_realtime add table orders, order_items, service_time_slots, services, service_menu_items;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
insert into expense_categories (name, sort_order) values
  ('Dough', 10), ('Cheese', 20), ('Sauce & ingredients', 30), ('Flour', 40), ('Toppings', 50),
  ('Boxes & packaging', 60), ('Delivery costs', 70), ('Equipment', 80), ('Marketing', 90),
  ('Software', 100), ('Payment fees', 110), ('Bakery', 120), ('Supplies', 130), ('Miscellaneous', 140);

insert into delivery_zones (name, fee_cents, sort_order) values
  ('Southfield', 500, 10),
  ('Oak Park', 700, 20);

insert into notification_templates (key, name, channel, subject, body, sort_order) values
  ('order_confirmation', 'Order confirmation', 'email',
   'Your {{business_name}} order {{order_number}} is confirmed',
   'Hi {{first_name}}! Your order {{order_number}} is confirmed for {{pickup_time}}. {{payment_instructions}} See you soon! 🍕', 10),
  ('ready_soon', 'Ready in ~5 minutes', 'email',
   '{{business_name}}: your order is almost ready',
   'Hi {{first_name}}! Your {{business_name}} order {{order_number}} will be ready in about 5 minutes.', 20),
  ('ready_now', 'Ready now', 'email',
   '{{business_name}}: your order is ready 🍕',
   'Hi {{first_name}}! Your {{business_name}} order {{order_number}} is ready for pickup 🍕', 30),
  ('running_behind', 'Running behind', 'email',
   '{{business_name}}: running a little behind',
   'Hi {{first_name}}, we are running about {{eta_minutes}} minutes behind on order {{order_number}}. Sorry for the wait, it will be worth it!', 40),
  ('out_for_delivery', 'Out for delivery', 'email',
   '{{business_name}}: your order is on its way',
   'Hi {{first_name}}! Your {{business_name}} order {{order_number}} is out for delivery.', 50),
  ('pickup_reminder', 'Pickup reminder', 'email',
   '{{business_name}}: your order is waiting',
   'Hi {{first_name}}, your order {{order_number}} has been ready for a bit. Come grab it while it is hot!', 60);
