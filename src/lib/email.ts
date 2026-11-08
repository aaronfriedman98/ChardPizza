import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { messageVars, renderMessage } from "@/lib/messages";
import { formatCents } from "@/lib/format";
import { fmtDate, fmtWindow } from "@/lib/time";

// Gmail (app password) first, since it needs no domain; Resend as the fallback.
function gmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

async function deliver(msg: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<{ id: string | null; error: string | null }> {
  if (gmailConfigured()) {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    try {
      const info = await transport.sendMail(msg);
      return { id: info.messageId ?? null, error: null };
    } catch (e) {
      return { id: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(msg);
  return { id: data?.id ?? null, error: error?.message ?? null };
}

/**
 * Sends the order confirmation email if we can: needs Gmail or Resend credentials and a customer email.
 * Never throws; logs to `notifications` either way so the order page shows what happened.
 */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY || (gmailConfigured() ? "gmail" : undefined);
  const db = createAdminClient();
  try {
    const [{ data: orderRow }, { data: settingsRow }, { data: template }] = await Promise.all([
      db.from("orders").select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each)").eq("id", orderId).single(),
      db.from("settings").select("*").eq("id", true).single(),
      db.from("notification_templates").select("*").eq("key", "order_confirmation").maybeSingle(),
    ]);
    if (!orderRow || !settingsRow) return;
    const o = orderRow as Order;
    const settings = settingsRow as Settings;
    if (!o.customer_email || !template || !template.is_active) return;
    if (!apiKey) {
      console.warn("No email credentials (GMAIL_APP_PASSWORD or RESEND_API_KEY); skipping confirmation email for", o.order_number);
      return;
    }

    const vars = messageVars(o, settings);
    const subject = renderMessage(template.subject ?? `Your ${settings.business_name} order {{order_number}}`, vars);
    const intro = renderMessage(template.body, vars);
    const html = buildHtml(o, settings, intro, vars.order_link);
    const text = buildText(o, settings, intro, vars.order_link);
    const from = process.env.EMAIL_FROM ?? (gmailConfigured() ? `${settings.business_name} <${process.env.GMAIL_USER}>` : `${settings.business_name} <onboarding@resend.dev>`);

    const { id, error } = await deliver({ from, to: o.customer_email, subject, html, text, replyTo: settings.business_email ?? undefined });

    await db.from("notifications").insert({
      order_id: o.id,
      customer_id: o.customer_id,
      channel: "email",
      template_key: "order_confirmation",
      recipient: o.customer_email,
      subject,
      rendered_body: intro,
      status: error ? "failed" : "sent",
      provider_message_id: id,
      error,
      sent_at: error ? null : new Date().toISOString(),
    });
  } catch (e) {
    console.error("sendOrderConfirmation failed:", e);
  }
}

/**
 * Heads-up to the business inbox for every new website order (cash, Zelle, or a settled card).
 * Fire-and-forget: never throws, never blocks the customer.
 */
export async function notifyOwnerNewOrder(orderId: string): Promise<void> {
  const db = createAdminClient();
  try {
    const [{ data: orderRow }, { data: settingsRow }] = await Promise.all([
      db.from("orders").select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each)").eq("id", orderId).single(),
      db.from("settings").select("*").eq("id", true).single(),
    ]);
    if (!orderRow || !settingsRow) return;
    const o = orderRow as Order;
    const s = settingsRow as Settings;
    const to = s.business_email;
    if (!to || !(gmailConfigured() || process.env.RESEND_API_KEY)) return;

    const tz = s.time_zone;
    const when = `${o.fulfillment === "delivery" ? "Delivery" : "Pickup"} ${fmtDate(o.scheduled_at, tz, "EEE MMM d")}, ${fmtWindow(o.scheduled_at, tz)}`;
    const items = o.order_items.map((it) => `${it.quantity} × ${it.item_name}`).join(", ");
    const pay = o.payment_status === "paid" ? `PAID by ${o.payment_method}` : `${o.payment_method} · not paid yet`;
    const where = o.fulfillment === "delivery" ? [o.address_line1, o.address_line2, o.address_city].filter(Boolean).join(", ") : "";
    const adminLink = `${s.public_url.replace(/\/+$/, "")}/admin/orders/${o.id}`;
    const subject = `New order ${o.order_number}: ${items} (${formatCents(o.total_cents)})`;
    const lines = [
      `${o.customer_name} · ${o.customer_phone}${o.customer_email ? ` · ${o.customer_email}` : ""}`,
      when,
      items,
      `Total ${formatCents(o.total_cents)} · ${pay}`,
      ...(where ? [`Address: ${where}${o.address_notes ? ` (${o.address_notes})` : ""}`] : []),
      ...(o.special_instructions ? [`Note: ${o.special_instructions}`] : []),
      "",
      adminLink,
    ];
    const text = lines.join("\n");
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a2321">${lines
      .map((l) => (l === adminLink ? `<a href="${adminLink}">Open in admin</a>` : esc(l) || "<br>"))
      .join("<br>")}</div>`;
    const from = process.env.EMAIL_FROM ?? (gmailConfigured() ? `${s.business_name} <${process.env.GMAIL_USER}>` : `${s.business_name} <onboarding@resend.dev>`);
    const { error } = await deliver({ from, to, subject, html, text });
    if (error) console.error("owner alert failed:", error);
  } catch (e) {
    console.error("notifyOwnerNewOrder failed:", e);
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Plain-text twin of the HTML receipt. Spam filters distrust a one-line text part next to a full HTML one.
function buildText(o: Order, s: Settings, intro: string, link: string) {
  const tz = s.time_zone;
  const lines = [
    `${s.business_name} - order ${o.order_number}`,
    `${o.fulfillment === "delivery" ? "Delivery" : "Pickup"} ${fmtDate(o.scheduled_at, tz, "EEEE, MMMM d")}, ${fmtWindow(o.scheduled_at, tz)}`,
    "",
    intro,
    "",
    ...o.order_items.map((it) => `${it.quantity} x ${it.item_name}  ${formatCents(it.line_total_cents)}`),
    `Subtotal  ${formatCents(o.subtotal_cents)}`,
    ...(o.delivery_fee_cents ? [`Delivery  ${formatCents(o.delivery_fee_cents)}`] : []),
    ...(o.processing_fee_cents ? [`Card processing fee  ${formatCents(o.processing_fee_cents)}`] : []),
    `Total  ${formatCents(o.total_cents)}`,
    "",
    o.fulfillment === "delivery"
      ? `Delivering to: ${[o.address_line1, o.address_line2, o.address_city].filter(Boolean).join(", ")}`
      : `Pickup at: ${s.pickup_address ?? ""}${s.pickup_instructions ? `\n${s.pickup_instructions}` : ""}`,
    "",
    `Payment: ${o.payment_status === "paid" ? "Paid. Thank you!" : o.payment_method === "zelle" ? (s.zelle_instructions ?? "Pay by Zelle before pickup.") : o.payment_method === "cash" ? "Cash due at pickup." : ""}`,
    ...(o.special_instructions ? ["", `Your note: ${o.special_instructions}`] : []),
    "",
    `Order status: ${link}`,
    "",
    `${s.business_name}${s.business_email ? " - " + s.business_email : ""}`,
  ];
  return lines.join("\n");
}

function buildHtml(o: Order, s: Settings, intro: string, link: string) {
  const tz = s.time_zone;
  const logo = `${s.public_url.replace(/\/+$/, "")}/brand/chard-logo-horizontal-dark.png`;
  const rows = o.order_items
    .map((it) => `<tr><td style="padding:6px 0">${it.quantity} × ${esc(it.item_name)}</td><td style="padding:6px 0;text-align:right">${formatCents(it.line_total_cents)}</td></tr>`)
    .join("");
  const where =
    o.fulfillment === "delivery"
      ? `<b>Delivering to</b><br>${esc(o.address_line1 ?? "")}${o.address_line2 ? ", " + esc(o.address_line2) : ""}${o.address_city ? ", " + esc(o.address_city) : ""}`
      : `<b>Pickup at</b><br>${esc(s.pickup_address ?? "")}${s.pickup_instructions ? `<br><span style="color:#777">${esc(s.pickup_instructions)}</span>` : ""}`;
  const pay =
    o.payment_status === "paid"
      ? "Paid. Thank you!"
      : o.payment_method === "zelle"
        ? esc(s.zelle_instructions ?? "Pay by Zelle before pickup.")
        : o.payment_method === "cash"
          ? "Cash due at pickup."
          : "";
  return `<!doctype html><html><body style="margin:0;background:#f1e6d2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2a2321">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#160f0b;color:#f1e6d2;border-radius:4px;border:1px solid #c9a25c;padding:28px 24px;text-align:center">
    <img src="${logo}" alt="${esc(s.business_name)}" width="220" style="display:block;margin:0 auto;width:220px;height:auto">
    <div style="margin-top:14px;font-size:13px;letter-spacing:3px;color:#c9a25c">ORDER NUMBER</div>
    <div style="font-size:34px;font-weight:900;color:#c9a25c">${esc(o.order_number)}</div>
    <div style="margin-top:12px;font-size:16px">${o.fulfillment === "delivery" ? "Delivery" : "Pickup"} <b>${esc(fmtDate(o.scheduled_at, tz, "EEEE, MMMM d"))}</b>, <b>${esc(fmtWindow(o.scheduled_at, tz))}</b></div>
  </div>
  <p style="font-size:16px;line-height:1.5;margin:20px 4px">${esc(intro).replace(/\n/g, "<br>")}</p>
  <div style="background:#fff;border:1px solid #e8e0d4;border-radius:4px;padding:16px 18px">
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
      <tr><td style="padding-top:10px;border-top:1px solid #e8e0d4">Subtotal</td><td style="padding-top:10px;border-top:1px solid #e8e0d4;text-align:right">${formatCents(o.subtotal_cents)}</td></tr>
      ${o.delivery_fee_cents ? `<tr><td>Delivery</td><td style="text-align:right">${formatCents(o.delivery_fee_cents)}</td></tr>` : ""}
      ${o.processing_fee_cents ? `<tr><td>Card processing fee</td><td style="text-align:right">${formatCents(o.processing_fee_cents)}</td></tr>` : ""}
      <tr><td style="font-weight:700;font-size:17px;padding-top:6px">Total</td><td style="font-weight:700;font-size:17px;text-align:right;padding-top:6px">${formatCents(o.total_cents)}</td></tr>
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e8e0d4;border-radius:4px;padding:16px 18px;margin-top:12px;font-size:15px;line-height:1.5">${where}</div>
  <div style="background:#fbf3e3;border:1px solid #c9a25c;border-radius:4px;padding:16px 18px;margin-top:12px;font-size:15px;line-height:1.5"><b>Payment</b><br>${pay}</div>
  ${o.special_instructions ? `<p style="margin:16px 4px;color:#777">Your note: ${esc(o.special_instructions)}</p>` : ""}
  <p style="margin:20px 4px;font-size:14px"><a href="${link}" style="color:#8e3520">View your order status</a></p>
  <p style="margin:20px 4px;font-size:12px;color:#999">${esc(s.business_name)}${s.business_email ? " · " + esc(s.business_email) : ""}</p>
</div></body></html>`;
}
