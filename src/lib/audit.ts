import type { SupabaseClient } from "@supabase/supabase-js";

/** Writes one audit row. Fire-and-forget; never blocks the user action on audit failure. */
export async function audit(
  supabase: SupabaseClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
) {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details ?? null,
  });
  if (error) console.error("audit_log insert failed:", error.message);
}
