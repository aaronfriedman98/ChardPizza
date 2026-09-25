import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { messageVars, renderMessage } from "@/lib/messages";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";

/**
 * Sends the order confirmation email if we can: needs RESEND_API_KEY and a customer email.
 * Never throws; logs to `notifications` either way so the order page shows what happened.
 */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
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
      console.warn("RESEND_API_KEY missing; skipping confirmation email for", o.order_number);
      return;
    }

    const vars = messageVars(o, settings);
    const subject = renderMessage(template.subject ?? `Your ${settings.business_name} order {{order_number}}`, vars);
    const intro = renderMessage(template.body, vars);
    const html = buildHtml(o, settings, intro, vars.order_link);
    const from = process.env.EMAIL_FROM ?? `${settings.business_name} <onboarding@resend.dev>`;

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: o.customer_email, subject, html, text: intro });

    await db.from("notifications").insert({
      order_id: o.id,
      customer_id: o.customer_id,
      channel: "email",
      template_key: "order_confirmation",
      recipient: o.customer_email,
      subject,
      rendered_body: intro,
      status: error ? "failed" : "sent",
      provider_message_id: data?.id ?? null,
      error: error?.message ?? null,
      sent_at: error ? null : new Date().toISOString(),
    });
  } catch (e) {
    console.error("sendOrderConfirmation failed:", e);
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function buildHtml(o: Order, s: Settings, intro: string, link: string) {
  const tz = s.time_zone;
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
  return `<!doctype html><html><body style="margin:0;background:#f7f1e8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2a2321">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#141110;color:#f3ebdd;border-radius:16px;padding:28px 24px;text-align:center">
    <div style="font-size:28px;font-weight:900;letter-spacing:1px">${esc(s.business_name)}</div>
    <div style="margin-top:14px;font-size:13px;letter-spacing:3px;color:#f2a33a">ORDER NUMBER</div>
    <div style="font-size:34px;font-weight:900;color:#f2a33a">${esc(o.order_number)}</div>
    <div style="margin-top:12px;font-size:16px">${o.fulfillment === "delivery" ? "Delivery" : "Pickup"} <b>${esc(fmtDateOnly(o.scheduled_at.slice(0, 10), "EEEE, MMMM d"))}</b> at <b>${esc(fmtTime(o.scheduled_at, tz))}</b></div>
  </div>
  <p style="font-size:16px;line-height:1.5;margin:20px 4px">${esc(intro).replace(/\n/g, "<br>")}</p>
  <div style="background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:16px 18px">
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
      <tr><td style="padding-top:10px;border-top:1px solid #e8e0d4">Subtotal</td><td style="padding-top:10px;border-top:1px solid #e8e0d4;text-align:right">${formatCents(o.subtotal_cents)}</td></tr>
      ${o.delivery_fee_cents ? `<tr><td>Delivery</td><td style="text-align:right">${formatCents(o.delivery_fee_cents)}</td></tr>` : ""}
      <tr><td style="font-weight:700;font-size:17px;padding-top:6px">Total</td><td style="font-weight:700;font-size:17px;text-align:right;padding-top:6px">${formatCents(o.total_cents)}</td></tr>
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:16px 18px;margin-top:12px;font-size:15px;line-height:1.5">${where}</div>
  <div style="background:#fff7e8;border:1px solid #f2a33a;border-radius:12px;padding:16px 18px;margin-top:12px;font-size:15px;line-height:1.5"><b>Payment</b><br>${pay}</div>
  ${o.special_instructions ? `<p style="margin:16px 4px;color:#777">Your note: ${esc(o.special_instructions)}</p>` : ""}
  <p style="margin:20px 4px;font-size:14px"><a href="${link}" style="color:#c8551e">View your order status</a></p>
  <p style="margin:20px 4px;font-size:12px;color:#999">${esc(s.business_name)}${s.business_email ? " · " + esc(s.business_email) : ""}</p>
</div></body></html>`;
}
