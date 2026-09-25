alter table settings
  add column public_url text not null default 'https://chardpizza.netlify.app',
  add column share_message_template text not null default E'🍕 CHAR\u2019D PIZZA — {{day}}, {{date}}\nPickup {{start}} to {{end}}{{delivery_line}}\n\n{{menu}}\n\nOrder here 👉 {{order_url}}\n{{payment_line}}{{opens_line}}\nSpots are counted by the pizza, so grab your time early.';
