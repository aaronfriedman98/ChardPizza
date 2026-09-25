"use client";

import { useState, useTransition } from "react";
import type { Service, ServiceAvailability } from "@/lib/types";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { publicState, STATE_LABEL, STATE_TONE, STATUS_LABEL } from "@/lib/service-state";
import Link from "next/link";
import { DuplicateButton } from "../duplicate-button";
import { setOrderingOverride, setServiceStatus, setSoldOut } from "../actions";

export function ServiceHeader({
  service: s,
  availability,
  orderCount,
  tz,
}: {
  service: Service;
  availability: ServiceAvailability;
  orderCount: number;
  tz: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const state = publicState(s, new Date(), Number(availability?.units_remaining ?? Infinity));
  const isPublic = s.status === "scheduled" || s.status === "live";

  function run(fn: () => Promise<{ error?: string }>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
    });
  }

  return (
    <header className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title truncate">{s.name}</h1>
            <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink/70">{STATUS_LABEL[s.status]}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
          </div>
          <div className="text-sm text-ink/60">
            {fmtDateOnly(s.service_date)} · {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)} ·{" "}
            {Number(availability?.units_sold ?? 0)} / {s.pizza_capacity_total} pizza units · {orderCount} orders
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPublic && (
            <Link href={`/admin/services/${s.id}/share`} className="btn-ghost border border-line text-sm">
              Share
            </Link>
          )}
          <DuplicateButton id={s.id} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {s.status === "draft" && (
          <button className="btn-primary" disabled={pending} onClick={() => run(() => setServiceStatus(s.id, "scheduled"))}>
            Publish
          </button>
        )}

        {isPublic && s.ordering_override !== "paused" && state !== "closed" && (
          <button
            className="inline-flex items-center rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
            disabled={pending}
            onClick={() => run(() => setOrderingOverride(s.id, "paused"))}
          >
            ⏸ Pause new orders
          </button>
        )}
        {isPublic && s.ordering_override === "paused" && (
          <button className="btn-primary" disabled={pending} onClick={() => run(() => setOrderingOverride(s.id, "auto"))}>
            ▶ Resume ordering
          </button>
        )}

        {isPublic && s.ordering_override !== "closed" && (
          <button
            className="btn-ghost border border-line"
            disabled={pending}
            onClick={() => run(() => setOrderingOverride(s.id, "closed"), "Close ordering now? Existing orders are kept.")}
          >
            Close ordering
          </button>
        )}
        {isPublic && (s.ordering_override === "closed" || (s.ordering_override === "auto" && state === "closed")) && (
          <button className="btn-ghost border border-line" disabled={pending} onClick={() => run(() => setOrderingOverride(s.id, "open"))}>
            Reopen ordering
          </button>
        )}
        {isPublic && s.ordering_override === "open" && (
          <button className="btn-ghost border border-line" disabled={pending} onClick={() => run(() => setOrderingOverride(s.id, "auto"))}>
            Back to scheduled times
          </button>
        )}

        {isPublic && (
          <button
            className={`btn-ghost border border-line ${s.is_sold_out ? "text-green-700" : "text-red-700"}`}
            disabled={pending}
            onClick={() => run(() => setSoldOut(s.id, !s.is_sold_out))}
          >
            {s.is_sold_out ? "Clear sold out" : "Mark sold out"}
          </button>
        )}

        {s.status === "scheduled" && (
          <button className="btn-ghost border border-line" disabled={pending} onClick={() => run(() => setServiceStatus(s.id, "live"))}>
            Start service
          </button>
        )}
        {(s.status === "live" || s.status === "scheduled") && (
          <button
            className="btn-ghost border border-line"
            disabled={pending}
            onClick={() => run(() => setServiceStatus(s.id, "completed"), "Mark this service completed? It leaves the public site.")}
          >
            Complete service
          </button>
        )}
        {s.status === "scheduled" && orderCount === 0 && (
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => setServiceStatus(s.id, "draft"))}>
            Unpublish
          </button>
        )}
        {(s.status === "draft" || s.status === "scheduled" || s.status === "live") && (
          <button
            className="btn-ghost text-red-700"
            disabled={pending}
            onClick={() =>
              run(
                () => setServiceStatus(s.id, "cancelled"),
                orderCount > 0
                  ? `Cancel this service? ${orderCount} orders exist and will need to be handled individually.`
                  : "Cancel this service?",
              )
            }
          >
            Cancel service
          </button>
        )}
        {s.status === "completed" && (
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => setServiceStatus(s.id, "archived"))}>
            Archive
          </button>
        )}
        {s.status === "cancelled" && (
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => setServiceStatus(s.id, "draft"))}>
            Restore as draft
          </button>
        )}
      </div>
      {error && <p className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{error}</p>}
    </header>
  );
}
