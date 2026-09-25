"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { MessageTemplate } from "@/lib/messages";

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("notification_templates").select("*").eq("is_active", true).in("channel", ["whatsapp", "sms"]).order("sort_order");
  return (data ?? []) as MessageTemplate[];
}

const logSchema = z.object({
  order_id: z.string().uuid(),
  template_key: z.string().nullable(),
  channel: z.enum(["whatsapp", "sms"]),
  recipient: z.string().min(10),
  body: z.string().min(1).max(2000),
});

/** Records that a message was handed to WhatsApp or SMS. We cannot see delivery, so status is "sent". */
export async function logMessage(input: unknown): Promise<{ error?: string }> {
  const { supabase, admin } = await requireAdmin();
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return { error: "Bad message log." };
  const v = parsed.data;
  const { error } = await supabase.from("notifications").insert({
    order_id: v.order_id,
    channel: v.channel,
    template_key: v.template_key,
    recipient: v.recipient,
    rendered_body: v.body,
    status: "sent",
    sent_by: admin.id,
    sent_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${v.order_id}`);
  return {};
}

const templateSchema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(2000),
  subject: z.string().trim().max(120).nullable().optional(),
  is_active: z.boolean(),
});

export async function saveTemplate(input: unknown): Promise<{ error?: string; ok?: string }> {
  const { supabase } = await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the template." };
  const v = parsed.data;
  const { error } = await supabase
    .from("notification_templates")
    .update({ name: v.name, body: v.body, subject: v.subject ?? null, is_active: v.is_active })
    .eq("key", v.key);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/messages");
  return { ok: "Saved." };
}

export async function resendConfirmationEmail(orderId: string): Promise<{ error?: string; ok?: string }> {
  await requireAdmin();
  if (!process.env.RESEND_API_KEY) return { error: "Email is not set up yet (no Resend key)." };
  const { sendOrderConfirmation } = await import("@/lib/email");
  await sendOrderConfirmation(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Confirmation email sent." };
}
