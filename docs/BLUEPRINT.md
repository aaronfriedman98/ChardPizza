# Char'd Pizza — System Blueprint

Written 2026-09-24. This is the plan we build against. Cross out anything you don't want; everything here is negotiable except the capacity and payment safety rules.

Decisions already made:

- Stack: Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Realtime), hosted on Vercel.
- Repo: `C:\Projects\ChardPizza`, personal GitHub.
- v1 scope: public site, ordering, service setup, menu, capacity, live service board, kitchen and handoff views, cash + Zelle, email confirmations, expenses, basic reports. Stripe and SMS/WhatsApp are their own later steps.

---

## 1. The business as I understand it

Char'd Pizza is two 50/50 partners selling a short menu of pizzas and a few sides during a defined window, usually a few hours on one evening. Roughly 60–70 dough balls set the hard ceiling for a night. Orders are placed ahead of time, mostly from a link posted in a WhatsApp group, and picked up in 15-minute windows. Some nights offer delivery to a couple of nearby areas for a flat fee.

The old system (a form) had three real problems this build must solve:

1. Time slots filled by number of submissions, not by number of pizzas.
2. Nothing stopped two people from grabbing the last pizza at once.
3. Everything about the night had to be rebuilt by hand each week.

The night itself is messy: people arrive early or late, the kitchen falls behind, cash gets handed to whoever is nearest, and orders change. The software has to bend to that instead of fighting it.

---

## 2. Architecture

One Next.js application with three faces:

| Surface | Path | Who |
|---|---|---|
| Public site + ordering | `/`, `/order` | Customers, no login |
| Admin | `/admin/...` | Both partners, Supabase Auth login |
| Operations views | `/admin/kitchen`, `/admin/handoff`, `/admin/delivery` | Same login, screen-optimized for the job |

Supabase provides:

- **Postgres** with proper foreign keys, constraints, and migrations kept in the repo.
- **Auth** for the two admin accounts (email + password, more roles later).
- **Realtime** so the service board updates when the other partner taps something.
- **Row Level Security** so the browser can only read what it should. Customers never talk to the database directly; every order goes through server code.

The rule that keeps money and capacity safe: **the browser never decides prices, totals, or whether capacity exists.** Server code recomputes prices from the database, and one Postgres function places the order inside a transaction with row locks. The frontend only shows what it is told.

---

## 3. Stack detail

- Next.js App Router, TypeScript, Server Actions for admin writes, Route Handlers for webhooks.
- Tailwind CSS. Admin uses a small component kit (buttons, cards, sheets, dialogs) built once and reused. Public site gets its own warmer styling.
- Supabase JS client. Supabase CLI for migrations and local development.
- Zod for validating every incoming payload.
- Resend for transactional email (confirmation, ready notice). Free tier is plenty.
- Later: Stripe (Checkout + webhooks), Twilio or similar for SMS.
- Vercel for hosting, with a cron endpoint for housekeeping (expiring abandoned card checkouts, late-order checks).

Time zone: everything is stored as UTC `timestamptz`. The business time zone lives in settings (America/Detroit) and is the only thing used to render and to interpret admin-entered times.

Money: stored as integer cents everywhere. No floats.

---

## 4. Database schema

Tables, with the columns that matter. `id` is a UUID unless noted. Every table has `created_at`; mutable ones also have `updated_at`.

### People and configuration

**admin_users** — profile row for each Supabase Auth user.
`id (= auth.users.id), display_name, role (owner|manager|kitchen|handoff|driver), is_partner, is_active`

**settings** — one row. Business name, phone, email, pickup address, Zelle instructions, time zone, default slot minutes, default slot capacity, late-warning minutes, late-critical minutes, ready-uncollected minutes, special-instructions enabled, card fee mode (absorb|pass_through), card fee percent/flat, public messages for each ordering state.

**customers**
`id, full_name, phone (E.164, unique), email, notes, first_order_at, last_order_at, order_count, lifetime_spend_cents`
Matching rule: phone is the identity. Email is a secondary hint shown to the admin for manual merge, never auto-merged. Counts are updated by the order function, not recomputed on every page.

**customer_addresses**
`id, customer_id, line1, line2, city, delivery_zone_id, notes, is_default`

**delivery_zones**
`id, name, fee_cents, description, is_active, sort_order`

### Menu

**menu_items** — the permanent library.
`id, name, description, category, default_price_cents, capacity_units (numeric, default 1), photo_url, sku, is_active, sort_order`

`capacity_units` is the "how many pizzas' worth of oven does this consume" number. A pie is 1, onion soup is 0, a future half-pie could be 0.5.

### Services (a sale night)

**services**
`id, name, service_date, starts_at, ends_at, ordering_opens_at, ordering_closes_at, status (draft|scheduled|live|completed|cancelled|archived), ordering_override (auto|open|paused|closed), pizza_capacity_total, slot_minutes, default_slot_capacity, pickup_enabled, delivery_enabled, cash_enabled, zelle_enabled, card_enabled, allow_special_instructions, preorder_reserve_units (int, null), preorder_reserve_percent (int, null), customer_instructions, is_sold_out (manual flag), notes`

Two separate ideas here:

- `status` is the lifecycle (draft → scheduled → live → completed → archived).
- `ordering_override` is the admin's instant switch. `auto` means follow the open/close times. `open`, `paused`, `closed` override them. The Pause button sets `paused`; Resume sets `auto`.

**service_menu_items** — what is offered tonight, at what price.
`id, service_id, menu_item_id, price_cents, description_override, is_available, quantity_limit (null = unlimited), sold_out_manual, sort_order`

**service_time_slots**
`id, service_id, slot_start (timestamptz), slot_end, capacity_units, preorder_cap_units (null = same as capacity), is_blocked, sort_order`
Generated from start/end/slot_minutes when the service is created; each row is then editable on its own.

### Orders

**orders**
`id, order_number (text, unique, "CHAR-1042"), service_id, customer_id, fulfillment (pickup|delivery), time_slot_id, scheduled_at (snapshot of slot start), status, production_priority (int), is_rush, is_on_hold, delivery_zone_id, delivery_zone_name, delivery_fee_cents, address_line1, address_line2, address_city, address_notes, subtotal_cents, processing_fee_cents, tax_cents, total_cents, capacity_units, payment_method (cash|zelle|card), payment_status, special_instructions, source, referral, created_by_admin_id, confirmation_token, queued_at, started_at, ready_at, out_for_delivery_at, completed_at, cancelled_at, cancel_reason, expires_at`

Address and zone are snapshotted onto the order so history never changes when zones are edited.

`expires_at` is only set for card orders awaiting payment. An expired unpaid card order is cancelled by the cron job and its capacity returns. This gives us the "hold during checkout" behavior without a separate holds table.

**order_items**
`id, order_id, service_menu_item_id, menu_item_id, item_name, unit_price_cents, quantity, capacity_units_each, line_total_cents`
Name and price are snapshots. The menu can change forever without touching history.

**order_status_history**
`id, order_id, from_status, to_status, changed_by, changed_at, note`

**order_notes**
`id, order_id, body, is_customer_facing, created_by, created_at`

**payments** — a ledger, never edited, only appended.
`id, order_id, kind (payment|refund), method, amount_cents, status (recorded|pending|succeeded|failed), recorded_by, recorded_at, note, provider (manual|stripe), provider_reference`
"Mark Paid" inserts a payment row and updates `orders.payment_status`.

### Communication

**notification_templates**
`key, name, channel (email|sms), subject, body, is_active`
Body uses placeholders: `{{first_name}}`, `{{order_number}}`, `{{pickup_time}}`, `{{business_name}}`, `{{eta_minutes}}`.

**notifications** — the log.
`id, order_id, customer_id, channel, template_key, recipient, rendered_body, status (queued|sent|delivered|failed), provider_message_id, error, sent_at, sent_by`

### Money

**expense_categories** `id, name, sort_order, is_active`

**expenses**
`id, expense_date, amount_cents, category_id, vendor, description, receipt_url, service_id (null ok), paid_by (business|partner), paid_by_admin_id, is_reimbursable, reimbursed_at, notes, created_by`

### Audit

**audit_log**
`id, actor_id, action, entity_type, entity_id, details (jsonb), created_at`
Written by server code for: order created/edited/cancelled, payment recorded, status changed, capacity changed, service published/paused, settings changed.

### Sequences and functions

- `order_number_seq` starting at 1000 → `CHAR-1000`, `CHAR-1001`, ...
- `place_order(payload jsonb)` — the one function that creates an order. See section 12.
- `slot_availability(service_id)` — a view returning each slot with capacity, units sold, units remaining, blocked flag, and preorder cap remaining.
- `service_availability(service_id)` — total units sold vs. total, per-item sold vs. limit.

---

## 5. Pages and routes

### Public

| Route | Purpose |
|---|---|
| `/` | One-page site. Hero, live ordering state, current service card, about, WhatsApp/Instagram, contact, FAQ. |
| `/order` | The ordering flow. Redirects home with a message if nothing is open. |
| `/order/[orderNumber]?t=token` | Confirmation page and later a "where's my order" status page. |

### Admin

| Route | Purpose |
|---|---|
| `/admin/login` | Sign in |
| `/admin` | Dashboard: tonight's numbers if a service is live, otherwise next service + recent activity |
| `/admin/service` | **Service board** — live order cards, filters, quick actions, Pause button |
| `/admin/kitchen` | What to make next, batch summary, big type |
| `/admin/handoff` | Name / order number / paid / ready, one-tap Picked Up and Mark Paid |
| `/admin/delivery` | Delivery queue with addresses and phone |
| `/admin/orders` | All orders, search and filters, any service |
| `/admin/orders/new` | Manual order (same engine as the public flow, with an override switch) |
| `/admin/orders/[id]` | Order detail: items, payments, notes, notifications, history, edit |
| `/admin/services` | List: drafts, upcoming, past. Duplicate from here. |
| `/admin/services/new` | Six-step wizard |
| `/admin/services/[id]` | Edit any section; slot capacity grid; sold-out controls |
| `/admin/menu` | Menu library |
| `/admin/customers`, `/admin/customers/[id]` | Customer list and profile with order history |
| `/admin/expenses` | Expense list and entry |
| `/admin/reports` | Per-service P&L, item popularity, slot load, customer stats |
| `/admin/settings` | Business info, Zelle text, thresholds, templates, delivery zones, payment settings |

### Server endpoints

- `/api/cron/housekeeping` — expire abandoned card orders, nothing else. Protected by a secret.
- `/api/stripe/webhook` — later.

---

## 6. Customer ordering workflow

One page, four screens, progress shown at the top. Works one-handed on a phone.

1. **Menu.** Tonight's date and hours at the top. Items with photo, description, price, and a stepper. Sold-out items stay visible but disabled. A sticky bar shows "3 items · $66 · Continue".
2. **When and where.** Pickup or Delivery (only shown if both are enabled). If delivery: zone dropdown, then address. Then the time grid. Each slot shows availability relative to *this* order: a slot with 1 pizza left is disabled for a 2-pizza order and says "Only 1 left". If the chosen slot is full, the next open slot is suggested.
3. **Your info.** Name, phone, email, optional special instructions (if enabled). Payment method choice with the right explanation under each (Zelle instructions, "Cash due at pickup").
4. **Review and place.** Full breakdown: items, delivery fee, any card fee, total. Place Order button.

Placing the order calls the server, which re-prices everything and calls `place_order`. If capacity disappeared in the meantime, the customer is sent back to the time screen with a plain message and fresh availability.

**Confirmation** page shows the order number large, everything they ordered, time, payment status and instructions, pickup address or delivery address, and a link they can revisit. A confirmation email goes out immediately.

Returning customers: phone number is remembered in the browser and prefills name and email on the next visit. No accounts.

Order source: the link we post can carry `?src=whatsapp` and it gets stored on the order.

---

## 7. Service creation workflow

`/admin/services/new`, six steps, saves as a draft after step 1 so nothing is lost.

1. **Basics** — name (defaults to the date), date, service start/end, ordering opens/closes. Same-day is fine.
2. **Menu** — checklist of the library with tonight's price and optional limit per item. Defaults pulled from the library.
3. **Capacity** — total pizza units, slot length, default per-slot capacity. Generates the slot grid, which is then editable slot by slot. Optional preorder reserve.
4. **Fulfillment** — pickup on/off, delivery on/off, which zones.
5. **Payment** — cash, Zelle, card toggles. Customer instructions text.
6. **Review** — a preview of what the customer will see, then Publish (status → scheduled).

**Duplicate** copies everything above from any past service into a new draft with a new date. Never copies orders.

After publishing, every field stays editable. Editing capacity below what is already sold shows a warning with the numbers and requires confirmation. Removing a menu item that has orders is blocked; you mark it sold out instead.

---

## 8. Live service workflow (the service board)

Top strip: units sold / total, orders, revenue, paid vs outstanding, pickup vs delivery, current slot, a health pill (On schedule / Slightly behind / Backed up), and the big **Pause Orders** button.

Below: order cards grouped by time slot by default, or by status. Each card shows time, name, items, pickup/delivery badge, payment badge, status, and one-tap actions that depend on status:

| Status | Primary action | Also available |
|---|---|---|
| confirmed | Start | Rush, Hold, Mark Paid, Note, Edit, Cancel |
| making | Ready | Mark Paid, Note |
| ready (pickup) | Picked Up | Send "ready" message, Mark Paid |
| ready (delivery) | Out for Delivery | Send message |
| out_for_delivery | Delivered | |

Timers on cards:

- Scheduled time passed and not ready → "8 MIN BEHIND" (yellow after the warning threshold, red after critical).
- Ready and not collected → "READY 17 MIN".
- Customer arrived early is a one-tap flag on the card ("Here") that puts it at the top of the kitchen queue without changing the scheduled time.

Marking Picked Up on an unpaid order asks "Not marked paid. Pick up anyway?" with a Mark Paid & Pick Up shortcut.

Realtime: the board subscribes to `orders` changes for the live service. Both partners see the same thing within a second.

---

## 9. Kitchen workflow

`/admin/kitchen` is a separate, high-contrast view for whoever is at the oven.

- **Make now**: the next N orders by production priority (rush first, then priority, then scheduled time), each as a big card with just items and quantities and the order number.
- **Next 15 minutes**: a totals strip: "7 Char'd · 3 White · 2 Mexican" so the person shaping dough knows what's coming.
- Start and Ready buttons on each card. Nothing else. No prices, no emails, no addresses.
- Move up / move down arrows on each card. Drag and drop on tablet if it proves reliable; buttons always work.

`production_priority` is an integer we renumber on reorder. `scheduled_at` is never touched by any of this.

---

## 10. Payment architecture

Two independent fields on every order:

- `payment_method`: cash, zelle, card.
- `payment_status`: unpaid, awaiting_payment, due_at_pickup, paid, partially_refunded, refunded.

Defaults on creation: Zelle → awaiting_payment. Cash → due_at_pickup. Card → unpaid until the webhook says paid.

Every change to payment status is backed by a row in `payments` with who, when, how much, and an optional note. "Mark Paid" is one tap on the card; the note is optional and can be added afterward.

Card (later step): server creates a Stripe Checkout Session with the server-computed total, order is created as `pending_payment` with a 15-minute `expires_at`. Webhook `checkout.session.completed` flips it to confirmed/paid. Abandoned sessions expire and release capacity. Refunds go through Stripe and land as `refund` rows in `payments`.

Card fee: settings decide absorb vs pass-through and the rate. If passed through, it is a visible line item on the review screen. This is compliant as long as it is disclosed before payment, which the review screen does.

---

## 11. Notification architecture

One function: `sendNotification(orderId, templateKey, { channel?, overrides? })`.

- Looks up the template, renders placeholders, picks the channel (email now, SMS later, based on what the order's customer has and what the template supports).
- Writes a `notifications` row before sending, updates it with the result.
- Every quick-send button on a card calls this. Confirmation emails call this.

Channels are adapters: `email` (Resend) in v1, `sms` (Twilio) later. WhatsApp only if we go through the official API; nothing faked.

Order detail shows the log: "Confirmation sent 6:13 PM · Ready sent 7:48 PM".

Automatic sends in v1: confirmation only. Delay and reminder messages are always a tap, never automatic, unless we decide otherwise in settings later.

---

## 12. Capacity and concurrency

Availability has three layers, all checked together:

1. **Service total**: sum of `capacity_units` on non-cancelled orders ≤ `pizza_capacity_total`.
2. **Slot**: sum of units in the slot ≤ slot `capacity_units`, and slot not blocked, and during preorder ≤ `preorder_cap_units`.
3. **Item**: quantity sold of a service menu item ≤ `quantity_limit`, and not manually sold out.

`place_order` runs as one transaction:

```
lock the service row (FOR UPDATE)
lock the chosen slot row (FOR UPDATE)
verify ordering is actually open (status, override, open/close times)
recompute prices from service_menu_items (ignore anything the client sent)
compute units needed
check layers 1, 2, 3
insert order + items, assign order number
update customer stats
return the order
```

Because both rows are locked, two simultaneous checkouts for the last spot serialize: the second one sees the first one's units and fails cleanly with a message the UI turns into "That slot just filled up, here's what's open."

Cancelling an order or expiring a card checkout simply changes status; every availability query excludes cancelled and expired orders, so capacity returns automatically with no counters to keep in sync.

Admin edits to an order (quantity, slot) go through a sibling function `revise_order` with the same locks, checking the delta.

Admin capacity changes are plain updates with a server-side check: if the new capacity is below units already sold, the UI shows the numbers and asks to confirm. Existing orders are never cancelled by a capacity change.

---

## 13. Financial tracking

Per service, computed from the ledger, shown with the formula visible:

```
Item sales           sum of order subtotals (non-cancelled)
+ Delivery fees
+ Card fees collected
= Gross sales
- Refunds
= Net sales
- Expenses tied to this service
- Card processing cost (later, from Stripe)
= Service profit
```

"Collected" vs "billed" is shown separately so outstanding Zelle is obvious.

Partner ledger, across all time and per service: what each partner paid out of pocket, what was reimbursed, and the 50/50 profit share. This answers "who paid for what" and "what does the business owe each of us" without becoming accounting software.

Expenses can be tied to a service or left general (monthly software, equipment). Reports let you allocate general expenses per service evenly if you want a fuller picture, but that is a display option, not a data change.

---

## 14. Features I am adding beyond the spec

- **Order status page for customers**: the confirmation link keeps working and shows Making / Ready / Picked Up live. Cuts down "is it ready?" messages.
- **"Here" flag**: one tap when a customer walks in early; bumps kitchen priority and shows a badge on handoff.
- **Walk-up order**: a stripped-down manual order screen for someone standing at the table, three taps to an order.
- **Slot grid on the service page**: a single screen showing every slot's capacity, sold, remaining, with inline edit and block toggles. This is the "I never touch the database" promise for capacity.
- **Health pill logic**: average minutes late across active orders drives On schedule / Slightly behind / Backed up, with a "Consider pausing" nudge at the critical threshold.
- **Referral tag on links**: `?src=` tracking with a settings page listing the links to post.
- **Customer merge tool**: when two records look like one person, an admin can merge them deliberately. Never automatic.

Deferred on purpose: build-your-own toppings, driver assignment, coupons, customer accounts, multiple concurrent services (the schema allows it, the UI assumes one).

---

## 15. Build steps

Each step is one working session. Before each one I say what I am building and what I need from you.

| Step | What you get | Needs from you |
|---|---|---|
| 1 | This blueprint, approved | Your edits |
| 2 | Project scaffold, Supabase connected, migrations for the full schema, admin login working, empty admin shell with navigation | Supabase project created, keys in `.env.local`, both partners' emails for accounts |
| 3 | Settings page, menu library, delivery zones | Business facts: address, Zelle text, menu with prices |
| 4 | Service wizard, slot grid, duplicate, publish/pause/close controls | Nothing |
| 5 | Public site and ordering flow end to end, confirmation page, `place_order` with concurrency tests | Logo/brand colors if you have them, WhatsApp and Instagram links |
| 6 | Service board, kitchen, handoff, delivery views, realtime, timers, Mark Paid | Nothing |
| 7 | Manual orders, order editing, cancellations, customer profiles | Nothing |
| 8 | Email confirmations and quick-send notifications, templates | Resend account, a sending domain |
| 9 | Expenses, service P&L, partner ledger, reports | Expense categories you actually use |
| 10 | Deploy to Vercel, domain, mobile polish, edge-case scenarios from section 77 run for real | Vercel account, domain DNS |
| 11 | Stripe card payments with webhooks and refunds | Stripe account |
| 12 | SMS notifications | Twilio account and A2P 10DLC registration (starts weeks earlier) |

Steps 11 and 12 can be skipped or reordered. Nothing before them depends on them.
