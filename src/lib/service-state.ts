import type { Service } from "@/lib/types";

/** What the public site should do with a service right now. */
export type PublicState =
  | "hidden" // draft, cancelled, archived
  | "upcoming" // published, ordering not open yet
  | "open"
  | "paused"
  | "closed"
  | "sold_out"
  | "completed";

export function publicState(s: Service, now: Date = new Date(), unitsRemaining?: number): PublicState {
  if (s.status === "draft" || s.status === "cancelled" || s.status === "archived") return "hidden";
  if (s.status === "completed") return "completed";

  if (s.ordering_override === "paused") return "paused";
  if (s.ordering_override === "closed") return "closed";

  const soldOut = s.is_sold_out || (unitsRemaining !== undefined && unitsRemaining <= 0);

  if (s.ordering_override === "open") return soldOut ? "sold_out" : "open";

  // auto
  if (s.ordering_opens_at && now < new Date(s.ordering_opens_at)) return "upcoming";
  if (s.ordering_closes_at && now >= new Date(s.ordering_closes_at)) return "closed";
  if (now >= new Date(s.ends_at)) return "closed";
  return soldOut ? "sold_out" : "open";
}

export const STATE_LABEL: Record<PublicState, string> = {
  hidden: "Not public",
  upcoming: "Upcoming",
  open: "Ordering open",
  paused: "Paused",
  closed: "Ordering closed",
  sold_out: "Sold out",
  completed: "Completed",
};

export const STATE_TONE: Record<PublicState, string> = {
  hidden: "bg-ink/10 text-ink/70",
  upcoming: "bg-blue-100 text-blue-800",
  open: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  closed: "bg-ink/10 text-ink/70",
  sold_out: "bg-red-100 text-red-800",
  completed: "bg-ink/10 text-ink/70",
};

export const STATUS_LABEL: Record<Service["status"], string> = {
  draft: "Draft",
  scheduled: "Published",
  live: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};
