-- Pies in the oven, per order, keyed by pie name: {"Char'd Pie": 2}.
-- A pie counts as made once it is in the oven. Kept on the order (not the items)
-- so changing an order's pies never loses the count. orders is already in realtime.
alter table orders add column if not exists oven jsonb not null default '{}'::jsonb;
