import type { MessageTemplate } from "@/lib/messages";

// Built-in copy of the Message menu templates (Nov 7 2026), so the menu works even when the server can't be reached.
// Edits made in Settings > Messages still win whenever the page can load them.
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    "key": "order_received",
    "name": "Order received (manual orders)",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}! Got your Char'd order {{order_number}}: {{items}}. Pickup {{pickup_time}}. {{payment_instructions}}",
    "is_active": true,
    "sort_order": 5
  },
  {
    "key": "ready_soon",
    "name": "Ready in ~5 minutes",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}! Your Char'd order {{order_number}} will be ready in about 5 minutes 🍕",
    "is_active": true,
    "sort_order": 20
  },
  {
    "key": "ready_now",
    "name": "Ready now",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}! Your Char'd order {{order_number}} is ready for pickup 🍕",
    "is_active": true,
    "sort_order": 30
  },
  {
    "key": "running_behind",
    "name": "Running behind",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}, we're running about {{eta_minutes}} minutes behind on order {{order_number}}. Sorry for the wait, it'll be worth it 🔥",
    "is_active": true,
    "sort_order": 40
  },
  {
    "key": "out_for_delivery",
    "name": "Out for delivery",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}! Your Char'd order {{order_number}} is on its way 🚗",
    "is_active": true,
    "sort_order": 50
  },
  {
    "key": "delivery_arriving",
    "name": "Delivery arriving",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}! Your Char'd order {{order_number}} is a couple of minutes away 🚗🍕",
    "is_active": true,
    "sort_order": 55
  },
  {
    "key": "pickup_reminder",
    "name": "Pickup reminder",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}, your Char'd order {{order_number}} has been ready for a bit. Come grab it while it's hot! 🍕",
    "is_active": true,
    "sort_order": 60
  },
  {
    "key": "payment_reminder",
    "name": "Payment reminder",
    "channel": "whatsapp",
    "subject": null,
    "body": "Hi {{first_name}}, quick reminder that Char'd order {{order_number}} ({{total}}) is still unpaid. {{payment_instructions}}",
    "is_active": true,
    "sort_order": 70
  }
];
