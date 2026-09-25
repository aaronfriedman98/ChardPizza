-- Quick-send templates become WhatsApp messages. Confirmation stays email (optional receipt).
update notification_templates set channel = 'whatsapp', subject = null where key <> 'order_confirmation';

update notification_templates set body = 'Hi {{first_name}}! Your Char''d order {{order_number}} will be ready in about 5 minutes 🍕' where key = 'ready_soon';
update notification_templates set body = 'Hi {{first_name}}! Your Char''d order {{order_number}} is ready for pickup 🍕' where key = 'ready_now';
update notification_templates set body = 'Hi {{first_name}}, we''re running about {{eta_minutes}} minutes behind on order {{order_number}}. Sorry for the wait, it''ll be worth it 🔥' where key = 'running_behind';
update notification_templates set body = 'Hi {{first_name}}! Your Char''d order {{order_number}} is on its way 🚗' where key = 'out_for_delivery';
update notification_templates set body = 'Hi {{first_name}}, your Char''d order {{order_number}} has been ready for a bit. Come grab it while it''s hot! 🍕' where key = 'pickup_reminder';

insert into notification_templates (key, name, channel, subject, body, sort_order) values
  ('delivery_arriving', 'Delivery arriving', 'whatsapp', null, 'Hi {{first_name}}! Your Char''d order {{order_number}} is a couple of minutes away 🚗🍕', 55),
  ('order_received', 'Order received (manual orders)', 'whatsapp', null, 'Hi {{first_name}}! Got your Char''d order {{order_number}}: {{items}}. Pickup {{pickup_time}}. {{payment_instructions}}', 5),
  ('payment_reminder', 'Payment reminder', 'whatsapp', null, 'Hi {{first_name}}, quick reminder that Char''d order {{order_number}} ({{total}}) is still unpaid. {{payment_instructions}}', 70)
on conflict (key) do nothing;
