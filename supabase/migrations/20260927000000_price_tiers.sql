-- Price tiers (e.g. Family & friends at $20 a pie) and per-order custom pie pricing.
create table price_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pie_price_cents int not null check (pie_price_cents >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table price_tiers enable row level security;
create policy admin_all on price_tiers for all to authenticated using (is_admin()) with check (is_admin());
grant all on price_tiers to service_role;
grant select, insert, update, delete on price_tiers to authenticated;

alter table orders
  add column price_tier_id uuid references price_tiers (id) on delete set null,
  add column pie_price_override_cents int check (pie_price_override_cents is null or pie_price_override_cents >= 0),
  add column pricing_note text;

insert into price_tiers (name, pie_price_cents, sort_order) values ('Family & friends', 2000, 10);

-- Re-prices an order's pies (items that use oven capacity). Sides keep their price.
-- tier_id and override both null = back to the service menu price.
create or replace function apply_order_pricing(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_admin uuid := (payload->>'admin_id')::uuid;
  v_tier_id uuid := nullif(payload->>'tier_id', '')::uuid;
  v_override int := nullif(payload->>'override_cents', '')::int;
  v_note text := nullif(trim(payload->>'note'), '');
  v_tier price_tiers%rowtype;
  v_pie_price int;
  v_subtotal int;
  v_total int;
  v_paid int;
  v_pay_status payment_status;
begin
  if v_admin is null then raise exception 'INVALID: Admin required.'; end if;
  select * into v_order from orders where id = (payload->>'order_id')::uuid for update;
  if not found then raise exception 'NOT_FOUND: Order not found.'; end if;
  if v_order.status = 'cancelled' then raise exception 'INVALID: Cancelled orders cannot be re-priced.'; end if;

  if v_tier_id is not null then
    select * into v_tier from price_tiers where id = v_tier_id;
    if not found then raise exception 'INVALID: That price tier no longer exists.'; end if;
  end if;
  v_pie_price := coalesce(v_override, v_tier.pie_price_cents);

  -- Pies: tier/override price, or the menu price when clearing.
  update order_items oi
    set unit_price_cents = coalesce(v_pie_price, smi.price_cents, oi.unit_price_cents),
        line_total_cents = coalesce(v_pie_price, smi.price_cents, oi.unit_price_cents) * oi.quantity
    from order_items x
    left join service_menu_items smi on smi.id = x.service_menu_item_id
    where oi.id = x.id and oi.order_id = v_order.id and oi.capacity_units_each > 0;

  select coalesce(sum(line_total_cents), 0) into v_subtotal from order_items where order_id = v_order.id;
  v_total := v_subtotal + v_order.delivery_fee_cents + v_order.processing_fee_cents + v_order.tax_cents;

  select coalesce(sum(case when kind = 'payment' then amount_cents else -amount_cents end), 0) into v_paid
    from payments where order_id = v_order.id and status <> 'failed';
  v_pay_status := case
    when v_paid >= v_total and v_total > 0 then 'paid'::payment_status
    when v_order.payment_status = 'paid' then
      case v_order.payment_method when 'cash' then 'due_at_pickup'::payment_status when 'zelle' then 'awaiting_payment'::payment_status else 'unpaid'::payment_status end
    else v_order.payment_status end;

  update orders set
    price_tier_id = v_tier_id,
    pie_price_override_cents = v_override,
    pricing_note = v_note,
    subtotal_cents = v_subtotal,
    total_cents = v_total,
    payment_status = v_pay_status
  where id = v_order.id;

  update customers set lifetime_spend_cents = greatest(lifetime_spend_cents + (v_total - v_order.total_cents), 0) where id = v_order.customer_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
    values (v_admin, 'order.repriced', 'order', v_order.id::text,
      jsonb_build_object('order_number', v_order.order_number, 'tier', v_tier.name, 'override_cents', v_override, 'old_total', v_order.total_cents, 'new_total', v_total));

  return jsonb_build_object('total_cents', v_total, 'payment_status', v_pay_status);
end $$;

revoke all on function apply_order_pricing(jsonb) from public, anon, authenticated;
grant execute on function apply_order_pricing(jsonb) to service_role;
