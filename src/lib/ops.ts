import type { SupabaseClient } from "@supabase/supabase-js";
import type { Service, ServiceAvailability, Settings } from "@/lib/types";

/**
 * The service an operations page should show: an explicit ?service=id, otherwise
 * the live one, otherwise the soonest published one that ended less than 6 hours ago.
 */
export async function pickOpsService(supabase: SupabaseClient, explicitId?: string) {
  const { data: settingsRow } = await supabase.from("settings").select("*").eq("id", true).single();
  const settings = settingsRow as Settings;

  const { data: candidates } = await supabase
    .from("services")
    .select("*")
    .in("status", ["scheduled", "live"])
    .gt("ends_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order("starts_at");
  const list = (candidates ?? []) as Service[];

  let service: Service | null = null;
  if (explicitId) {
    const { data } = await supabase.from("services").select("*").eq("id", explicitId).maybeSingle();
    service = (data as Service) ?? null;
  }
  if (!service) service = list.find((s) => s.status === "live") ?? list[0] ?? null;

  let availability: ServiceAvailability | null = null;
  if (service) {
    const { data } = await supabase.from("service_availability").select("*").eq("service_id", service.id).single();
    availability = data as ServiceAvailability;
  }
  return { settings, service, availability, candidates: list };
}
