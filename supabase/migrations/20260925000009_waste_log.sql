-- Pies that used dough but never reached a customer: burnt, dropped, eaten, given away.
-- They count against the service's pizza capacity like a sale would.
create type waste_reason as enum ('burnt', 'dropped', 'eaten', 'given_away', 'other');

create table service_waste (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  menu_item_id uuid references menu_items (id) on delete set null,
  item_name text not null,
  units numeric(6,2) not null default 1 check (units > 0),
  reason waste_reason not null default 'burnt',
  note text,
  created_by uuid references admin_users (id),
  created_at timestamptz not null default now()
);
create index service_waste_service_idx on service_waste (service_id);
alter table service_waste enable row level security;
create policy admin_all on service_waste for all to authenticated using (is_admin()) with check (is_admin());
grant all on service_waste to service_role;
grant select, insert, update, delete on service_waste to authenticated;
alter publication supabase_realtime add table service_waste;

-- Units used = sold + wasted. (Views cannot gain a column in place, so recreate.)
drop view if exists service_availability;
create view service_availability as
select
  sv.id as service_id,
  sv.pizza_capacity_total,
  coalesce((select sum(o.capacity_units) from orders o where o.service_id = sv.id and o.status <> 'cancelled'), 0)::numeric as units_sold,
  coalesce((select sum(w.units) from service_waste w where w.service_id = sv.id), 0)::numeric as units_wasted,
  greatest(
    sv.pizza_capacity_total
      - coalesce((select sum(o.capacity_units) from orders o where o.service_id = sv.id and o.status <> 'cancelled'), 0)
      - coalesce((select sum(w.units) from service_waste w where w.service_id = sv.id), 0),
    0)::numeric as units_remaining,
  (select count(*) from orders o where o.service_id = sv.id and o.status <> 'cancelled') as order_count
from services sv;

-- place_order / revise_order: dough total now includes wasted pies.
create or replace function place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
  v_slot service_time_slots%rowtype;
  v_now timestamptz := now();
  v_admin uuid := nullif(payload->>'created_by_admin_id', '')::uuid;
  v_override boolean := coalesce((payload->>'capacity_override')::boolean, false) and v_admin is not null;
  v_fulfillment fulfillment_type := (payload->>'fulfillment')::fulfillment_type;
  v_method payment_method := (payload->>'payment_method')::payment_method;
  v_pay_status payment_status;
  v_customer_id uuid;
  v_name text := trim(payload->'customer'->>'name');
  v_phone text := trim(payload->'customer'->>'phone');
  v_email text := nullif(trim(payload->'customer'->>'email'), '');
  v_zone delivery_zones%rowtype;
  v_zone_fee int := 0;
  v_subtotal int := 0;
  v_units numeric := 0;
  v_item record;
  v_line jsonb;
  v_qty int;
  v_sold_units numeric;
  v_slot_sold numeric;
  v_slot_cap int;
  v_item_sold int;
  v_order_id uuid;
  v_order_number text;
  v_token text;
  v_lines jsonb := '[]'::jsonb;
  v_is_preorder boolean;
begin
  if v_name is null or v_name = '' then raise exception 'INVALID: Name is required.'; end if;
  if v_phone is null or v_phone !~ '^\+1\d{10}$' then raise exception 'INVALID: Phone number is not valid.'; end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'INVALID: Pick at least one item.';
  end if;

  -- Lock the service for the duration of this order.
  select * into v_service from services where id = (payload->>'service_id')::uuid for update;
  if not found then raise exception 'NOT_FOUND: That sale no longer exists.'; end if;

  if not v_override then
    if v_service.status not in ('scheduled', 'live') then
      raise exception 'ORDERING_CLOSED: Ordering is closed.';
    end if;
    if v_service.ordering_override = 'paused' then
      raise exception 'ORDERING_PAUSED: Ordering is paused right now.';
    elsif v_service.ordering_override = 'closed' then
      raise exception 'ORDERING_CLOSED: Ordering is closed.';
    elsif v_service.ordering_override = 'auto' then
      if v_service.ordering_opens_at is not null and v_now < v_service.ordering_opens_at then
        raise exception 'ORDERING_NOT_OPEN: Ordering has not opened yet.';
      end if;
      if (v_service.ordering_closes_at is not null and v_now >= v_service.ordering_closes_at) or v_now >= v_service.ends_at then
        raise exception 'ORDERING_CLOSED: Ordering is closed.';
      end if;
    end if;
    if v_service.is_sold_out then raise exception 'SOLD_OUT: Sold out.'; end if;
  end if;

  -- Fulfillment
  if v_fulfillment = 'pickup' and not v_service.pickup_enabled and not v_override then
    raise exception 'INVALID: Pickup is not offered for this sale.';
  end if;
  if v_fulfillment = 'delivery' then
    if not v_service.delivery_enabled and not v_override then
      raise exception 'INVALID: Delivery is not offered for this sale.';
    end if;
    if nullif(trim(payload->'delivery'->>'line1'), '') is null then
      raise exception 'INVALID: Delivery address is required.';
    end if;
    select z.* into v_zone from delivery_zones z where z.id = (payload->'delivery'->>'zone_id')::uuid;
    if not found then raise exception 'INVALID: Pick a delivery zone.'; end if;
    select coalesce(sdz.fee_cents_override, v_zone.fee_cents) into v_zone_fee
      from service_delivery_zones sdz
      where sdz.service_id = v_service.id and sdz.delivery_zone_id = v_zone.id;
    if not found then
      if v_override then v_zone_fee := v_zone.fee_cents;
      else raise exception 'INVALID: That zone is not available for this sale.'; end if;
    end if;
  end if;

  -- Payment method
  if not v_override then
    if (v_method = 'cash' and not v_service.cash_enabled)
      or (v_method = 'zelle' and not v_service.zelle_enabled)
      or (v_method = 'card' and not v_service.card_enabled) then
      raise exception 'INVALID: That payment method is not available.';
    end if;
  end if;
  v_pay_status := case v_method
    when 'cash' then 'due_at_pickup'::payment_status
    when 'zelle' then 'awaiting_payment'::payment_status
    else 'unpaid'::payment_status end;

  -- Slot (locked)
  select * into v_slot from service_time_slots
    where id = (payload->>'time_slot_id')::uuid and service_id = v_service.id
    for update;
  if not found then raise exception 'INVALID: Pick a time.'; end if;
  if v_slot.is_blocked and not v_override then
    raise exception 'SLOT_FULL: That time is no longer available.';
  end if;

  -- Items: re-price from the database, check limits, sum units.
  for v_line in select * from jsonb_array_elements(payload->'items') loop
    v_qty := (v_line->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select smi.id as smi_id, smi.menu_item_id, smi.price_cents, smi.quantity_limit, smi.sold_out_manual, smi.is_available,
           mi.name, mi.capacity_units
      into v_item
      from service_menu_items smi
      join menu_items mi on mi.id = smi.menu_item_id
      where smi.id = (v_line->>'service_menu_item_id')::uuid and smi.service_id = v_service.id
      for update of smi;
    if not found then raise exception 'INVALID: One of the items is not on this menu.'; end if;
    if (not v_item.is_available or v_item.sold_out_manual) and not v_override then
      raise exception 'ITEM_SOLD_OUT: % is sold out.', v_item.name;
    end if;
    if v_item.quantity_limit is not null and not v_override then
      select coalesce(sum(oi.quantity), 0) into v_item_sold
        from order_items oi join orders o on o.id = oi.order_id
        where oi.service_menu_item_id = v_item.smi_id and o.status <> 'cancelled';
      if v_item_sold + v_qty > v_item.quantity_limit then
        raise exception 'ITEM_SOLD_OUT: Only % of % left.', greatest(v_item.quantity_limit - v_item_sold, 0), v_item.name;
      end if;
    end if;

    v_subtotal := v_subtotal + v_item.price_cents * v_qty;
    v_units := v_units + v_item.capacity_units * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'service_menu_item_id', v_item.smi_id,
      'menu_item_id', v_item.menu_item_id,
      'item_name', v_item.name,
      'unit_price_cents', v_item.price_cents,
      'quantity', v_qty,
      'capacity_units_each', v_item.capacity_units,
      'line_total_cents', v_item.price_cents * v_qty
    );
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'INVALID: Pick at least one item.'; end if;

  -- Capacity checks (only when the order uses oven capacity).
  if v_units > 0 and not v_override then
    select coalesce((select sum(capacity_units) from orders where service_id = v_service.id and status <> 'cancelled'), 0)
         + coalesce((select sum(units) from service_waste where service_id = v_service.id), 0)
      into v_sold_units;
    if v_sold_units + v_units > v_service.pizza_capacity_total then
      raise exception 'SOLD_OUT: Only % pizza spot% left tonight.',
        trim_scale(greatest(v_service.pizza_capacity_total - v_sold_units, 0)),
        case when greatest(v_service.pizza_capacity_total - v_sold_units, 0) = 1 then '' else 's' end;
    end if;

    select coalesce(sum(capacity_units), 0) into v_slot_sold
      from orders where time_slot_id = v_slot.id and status <> 'cancelled';

    v_is_preorder := v_now < v_service.starts_at;
    v_slot_cap := v_slot.capacity_units;
    if v_is_preorder then
      if v_slot.preorder_cap_units is not null then
        v_slot_cap := least(v_slot_cap, v_slot.preorder_cap_units);
      elsif v_service.preorder_reserve_units is not null then
        v_slot_cap := greatest(v_slot_cap - v_service.preorder_reserve_units, 0);
      elsif v_service.preorder_reserve_percent is not null then
        v_slot_cap := floor(v_slot_cap * (100 - v_service.preorder_reserve_percent) / 100.0);
      end if;
    end if;

    if v_slot_sold + v_units > v_slot_cap then
      raise exception 'SLOT_FULL: Only % pizza spot% left at that time.',
        trim_scale(greatest(v_slot_cap - v_slot_sold, 0)),
        case when greatest(v_slot_cap - v_slot_sold, 0) = 1 then '' else 's' end;
    end if;
  end if;

  -- Customer: phone is identity. Latest name/email wins.
  insert into customers (full_name, phone, email, first_order_at, last_order_at, order_count, lifetime_spend_cents)
    values (v_name, v_phone, v_email, v_now, v_now, 0, 0)
    on conflict (phone) do update
      set full_name = excluded.full_name,
          email = coalesce(excluded.email, customers.email),
          first_order_at = coalesce(customers.first_order_at, v_now)
    returning id into v_customer_id;

  -- Order
  insert into orders (
    service_id, customer_id, fulfillment, time_slot_id, scheduled_at, status,
    delivery_zone_id, delivery_zone_name, delivery_fee_cents,
    address_line1, address_line2, address_city, address_notes,
    customer_name, customer_phone, customer_email,
    subtotal_cents, processing_fee_cents, tax_cents, total_cents, capacity_units,
    payment_method, payment_status, special_instructions, source, referral,
    created_by_admin_id, capacity_override, expires_at, production_priority
  ) values (
    v_service.id, v_customer_id, v_fulfillment, v_slot.id, v_slot.slot_start,
    case when v_method = 'card' then 'pending_payment'::order_status else 'confirmed'::order_status end,
    case when v_fulfillment = 'delivery' then v_zone.id end,
    case when v_fulfillment = 'delivery' then v_zone.name end,
    case when v_fulfillment = 'delivery' then v_zone_fee else 0 end,
    case when v_fulfillment = 'delivery' then trim(payload->'delivery'->>'line1') end,
    case when v_fulfillment = 'delivery' then nullif(trim(payload->'delivery'->>'line2'), '') end,
    case when v_fulfillment = 'delivery' then nullif(trim(payload->'delivery'->>'city'), '') end,
    case when v_fulfillment = 'delivery' then nullif(trim(payload->'delivery'->>'notes'), '') end,
    v_name, v_phone, v_email,
    v_subtotal, 0, 0, v_subtotal + case when v_fulfillment = 'delivery' then v_zone_fee else 0 end, v_units,
    v_method, v_pay_status, nullif(trim(payload->>'special_instructions'), ''),
    coalesce(nullif(payload->>'source', ''), 'website'), nullif(payload->>'referral', ''),
    v_admin, v_override,
    case when v_method = 'card' then v_now + interval '15 minutes' end,
    extract(epoch from v_slot.slot_start)::bigint
  )
  returning id, order_number, confirmation_token into v_order_id, v_order_number, v_token;

  insert into order_items (order_id, service_menu_item_id, menu_item_id, item_name, unit_price_cents, quantity, capacity_units_each, line_total_cents)
    select v_order_id, (l->>'service_menu_item_id')::uuid, (l->>'menu_item_id')::uuid, l->>'item_name',
           (l->>'unit_price_cents')::int, (l->>'quantity')::int, (l->>'capacity_units_each')::numeric, (l->>'line_total_cents')::int
    from jsonb_array_elements(v_lines) l;

  update customers
    set order_count = order_count + 1,
        lifetime_spend_cents = lifetime_spend_cents + (v_subtotal + case when v_fulfillment = 'delivery' then v_zone_fee else 0 end),
        last_order_at = v_now
    where id = v_customer_id;

  if v_fulfillment = 'delivery' then
    insert into customer_addresses (customer_id, line1, line2, city, delivery_zone_id, notes)
    select v_customer_id, trim(payload->'delivery'->>'line1'), nullif(trim(payload->'delivery'->>'line2'), ''),
           nullif(trim(payload->'delivery'->>'city'), ''), v_zone.id, nullif(trim(payload->'delivery'->>'notes'), '')
    where not exists (
      select 1 from customer_addresses ca
      where ca.customer_id = v_customer_id and lower(ca.line1) = lower(trim(payload->'delivery'->>'line1'))
    );
  end if;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'token', v_token);
end $$;

revoke all on function place_order(jsonb) from public, anon, authenticated;
grant execute on function place_order(jsonb) to service_role;


create or replace function revise_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_service services%rowtype;
  v_slot service_time_slots%rowtype;
  v_now timestamptz := now();
  v_admin uuid := nullif(payload->>'admin_id', '')::uuid;
  v_override boolean := coalesce((payload->>'capacity_override')::boolean, false);
  v_fulfillment fulfillment_type := coalesce((payload->>'fulfillment')::fulfillment_type, null);
  v_method payment_method;
  v_zone delivery_zones%rowtype;
  v_zone_fee int := 0;
  v_subtotal int := 0;
  v_units numeric := 0;
  v_item record;
  v_line jsonb;
  v_qty int;
  v_sold_units numeric;
  v_slot_sold numeric;
  v_item_sold int;
  v_lines jsonb := '[]'::jsonb;
  v_paid int;
  v_new_total int;
  v_pay_status payment_status;
  v_name text;
  v_phone text;
  v_email text;
begin
  if v_admin is null then raise exception 'INVALID: Admin required.'; end if;

  select * into v_order from orders where id = (payload->>'order_id')::uuid for update;
  if not found then raise exception 'NOT_FOUND: Order not found.'; end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'INVALID: Completed or cancelled orders cannot be edited. Restore it first.';
  end if;

  select * into v_service from services where id = v_order.service_id for update;

  v_fulfillment := coalesce(v_fulfillment, v_order.fulfillment);
  v_method := coalesce((payload->>'payment_method')::payment_method, v_order.payment_method);
  v_name := coalesce(nullif(trim(payload->'customer'->>'name'), ''), v_order.customer_name);
  v_phone := coalesce(nullif(trim(payload->'customer'->>'phone'), ''), v_order.customer_phone);
  v_email := case when payload->'customer' ? 'email' then nullif(trim(payload->'customer'->>'email'), '') else v_order.customer_email end;
  if v_phone !~ '^\+1\d{10}$' then raise exception 'INVALID: Phone number is not valid.'; end if;

  -- Slot: the requested one, or keep the current one.
  select * into v_slot from service_time_slots
    where id = coalesce(nullif(payload->>'time_slot_id', '')::uuid, v_order.time_slot_id) and service_id = v_service.id
    for update;
  if not found then raise exception 'INVALID: Pick a time.'; end if;
  if v_slot.is_blocked and not v_override and v_slot.id <> v_order.time_slot_id then
    raise exception 'SLOT_FULL: That time is blocked.';
  end if;

  -- Delivery
  if v_fulfillment = 'delivery' then
    if nullif(trim(coalesce(payload->'delivery'->>'line1', v_order.address_line1)), '') is null then
      raise exception 'INVALID: Delivery address is required.';
    end if;
    select z.* into v_zone from delivery_zones z
      where z.id = coalesce(nullif(payload->'delivery'->>'zone_id', '')::uuid, v_order.delivery_zone_id);
    if not found then raise exception 'INVALID: Pick a delivery zone.'; end if;
    select coalesce(sdz.fee_cents_override, v_zone.fee_cents) into v_zone_fee
      from service_delivery_zones sdz where sdz.service_id = v_service.id and sdz.delivery_zone_id = v_zone.id;
    if not found then v_zone_fee := v_zone.fee_cents; end if;
  end if;

  -- Items
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'INVALID: An order needs at least one item.';
  end if;
  for v_line in select * from jsonb_array_elements(payload->'items') loop
    v_qty := (v_line->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select smi.id as smi_id, smi.menu_item_id, smi.price_cents, smi.quantity_limit, smi.sold_out_manual, smi.is_available, mi.name, mi.capacity_units
      into v_item
      from service_menu_items smi join menu_items mi on mi.id = smi.menu_item_id
      where smi.id = (v_line->>'service_menu_item_id')::uuid and smi.service_id = v_service.id
      for update of smi;
    if not found then raise exception 'INVALID: One of the items is not on this menu.'; end if;
    if v_item.quantity_limit is not null and not v_override then
      select coalesce(sum(oi.quantity), 0) into v_item_sold
        from order_items oi join orders o on o.id = oi.order_id
        where oi.service_menu_item_id = v_item.smi_id and o.status <> 'cancelled' and o.id <> v_order.id;
      if v_item_sold + v_qty > v_item.quantity_limit then
        raise exception 'ITEM_SOLD_OUT: Only % of % left.', greatest(v_item.quantity_limit - v_item_sold, 0), v_item.name;
      end if;
    end if;
    -- Keep the price the customer was originally quoted when the item was already on the order.
    select coalesce((select oi.unit_price_cents from order_items oi where oi.order_id = v_order.id and oi.service_menu_item_id = v_item.smi_id limit 1), v_item.price_cents)
      into v_item.price_cents;
    v_subtotal := v_subtotal + v_item.price_cents * v_qty;
    v_units := v_units + v_item.capacity_units * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'service_menu_item_id', v_item.smi_id, 'menu_item_id', v_item.menu_item_id, 'item_name', v_item.name,
      'unit_price_cents', v_item.price_cents, 'quantity', v_qty, 'capacity_units_each', v_item.capacity_units,
      'line_total_cents', v_item.price_cents * v_qty);
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'INVALID: An order needs at least one item.'; end if;

  -- Capacity, excluding this order's own current units.
  if v_units > 0 and not v_override then
    select coalesce((select sum(capacity_units) from orders where service_id = v_service.id and status <> 'cancelled' and id <> v_order.id), 0)
         + coalesce((select sum(units) from service_waste where service_id = v_service.id), 0)
      into v_sold_units;
    if v_sold_units + v_units > v_service.pizza_capacity_total then
      raise exception 'SOLD_OUT: Only % pizza spot% left tonight.',
        trim_scale(greatest(v_service.pizza_capacity_total - v_sold_units, 0)),
        case when greatest(v_service.pizza_capacity_total - v_sold_units, 0) = 1 then '' else 's' end;
    end if;
    select coalesce(sum(capacity_units), 0) into v_slot_sold
      from orders where time_slot_id = v_slot.id and status <> 'cancelled' and id <> v_order.id;
    if v_slot_sold + v_units > v_slot.capacity_units then
      raise exception 'SLOT_FULL: Only % pizza spot% left at that time.',
        trim_scale(greatest(v_slot.capacity_units - v_slot_sold, 0)),
        case when greatest(v_slot.capacity_units - v_slot_sold, 0) = 1 then '' else 's' end;
    end if;
  end if;

  v_new_total := v_subtotal + case when v_fulfillment = 'delivery' then v_zone_fee else 0 end + v_order.processing_fee_cents + v_order.tax_cents;

  -- Payment status follows the money: paid stays paid only if enough has been recorded.
  select coalesce(sum(case when kind = 'payment' then amount_cents else -amount_cents end), 0) into v_paid
    from payments where order_id = v_order.id and status <> 'failed';
  if v_paid >= v_new_total and v_new_total > 0 then
    v_pay_status := 'paid';
  elsif v_paid > 0 then
    v_pay_status := case v_method when 'cash' then 'due_at_pickup' when 'zelle' then 'awaiting_payment' else 'unpaid' end;
  else
    v_pay_status := case v_method when 'cash' then 'due_at_pickup' when 'zelle' then 'awaiting_payment' else 'unpaid' end;
  end if;

  update orders set
    fulfillment = v_fulfillment,
    time_slot_id = v_slot.id,
    scheduled_at = v_slot.slot_start,
    production_priority = case when v_slot.id <> v_order.time_slot_id then extract(epoch from v_slot.slot_start)::bigint else production_priority end,
    delivery_zone_id = case when v_fulfillment = 'delivery' then v_zone.id end,
    delivery_zone_name = case when v_fulfillment = 'delivery' then v_zone.name end,
    delivery_fee_cents = case when v_fulfillment = 'delivery' then v_zone_fee else 0 end,
    address_line1 = case when v_fulfillment = 'delivery' then coalesce(nullif(trim(payload->'delivery'->>'line1'), ''), address_line1) end,
    address_line2 = case when v_fulfillment = 'delivery' then coalesce(nullif(trim(payload->'delivery'->>'line2'), ''), address_line2) end,
    address_city = case when v_fulfillment = 'delivery' then coalesce(nullif(trim(payload->'delivery'->>'city'), ''), address_city) end,
    address_notes = case when v_fulfillment = 'delivery' then coalesce(nullif(trim(payload->'delivery'->>'notes'), ''), address_notes) end,
    customer_name = v_name,
    customer_phone = v_phone,
    customer_email = v_email,
    subtotal_cents = v_subtotal,
    total_cents = v_new_total,
    capacity_units = v_units,
    payment_method = v_method,
    payment_status = v_pay_status,
    special_instructions = case when payload ? 'special_instructions' then nullif(trim(payload->>'special_instructions'), '') else special_instructions end
  where id = v_order.id;

  delete from order_items where order_id = v_order.id;
  insert into order_items (order_id, service_menu_item_id, menu_item_id, item_name, unit_price_cents, quantity, capacity_units_each, line_total_cents)
    select v_order.id, (l->>'service_menu_item_id')::uuid, (l->>'menu_item_id')::uuid, l->>'item_name',
           (l->>'unit_price_cents')::int, (l->>'quantity')::int, (l->>'capacity_units_each')::numeric, (l->>'line_total_cents')::int
    from jsonb_array_elements(v_lines) l;

  update customers set lifetime_spend_cents = greatest(lifetime_spend_cents + (v_new_total - v_order.total_cents), 0), full_name = v_name
    where id = v_order.customer_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
    values (v_admin, 'order.revised', 'order', v_order.id::text,
      jsonb_build_object('order_number', v_order.order_number, 'old_total', v_order.total_cents, 'new_total', v_new_total,
                         'old_units', v_order.capacity_units, 'new_units', v_units, 'override', v_override));

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total_cents', v_new_total, 'payment_status', v_pay_status);
end $$;

revoke all on function revise_order(jsonb) from public, anon, authenticated;
grant execute on function revise_order(jsonb) to service_role;
