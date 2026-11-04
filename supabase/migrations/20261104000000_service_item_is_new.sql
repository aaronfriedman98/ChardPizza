-- "New" flag per pie per sale: badge on the site and order page, stamp on the flyer, 🆕 in WhatsApp.
alter table service_menu_items add column if not exists is_new boolean not null default false;
