import Link from "next/link";
import { Logo, LogoMark, Wordmark } from "@/components/brand/logo";
import { getCurrentService, getOrderingData, getSettings } from "@/lib/public";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";
import type { PublicState } from "@/lib/service-state";

export const dynamic = "force-dynamic";

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { src } = await searchParams;
  const [settings, current] = await Promise.all([getSettings(), getCurrentService()]);
  const data = current ? await getOrderingData(current.service.id) : null;
  const tz = settings.time_zone;
  const state: PublicState = current?.state ?? "hidden";
  const s = current?.service ?? null;
  const orderHref = typeof src === "string" ? `/order?src=${encodeURIComponent(src)}` : "/order";

  const vars = {
    service_date: s ? fmtDateOnly(s.service_date) : "",
    opens_at: s?.ordering_opens_at ? fmtDateTime(s.ordering_opens_at, tz) : "",
  };

  const headline: Record<PublicState, { kicker: string; line: string }> = {
    hidden: { kicker: "Nothing in the oven", line: settings.msg_no_service },
    upcoming: { kicker: "Next sale", line: fill(settings.msg_upcoming, vars) },
    open: { kicker: "Ordering is open", line: s ? `${fmtDateOnly(s.service_date)} · ${fmtTime(s.starts_at, tz)} to ${fmtTime(s.ends_at, tz)}` : "" },
    paused: { kicker: "Hold tight", line: settings.msg_paused },
    closed: { kicker: "Ordering closed", line: settings.msg_closed },
    sold_out: { kicker: "Sold out", line: settings.msg_sold_out },
    completed: { kicker: "That's a wrap", line: settings.msg_no_service },
  };
  const h = headline[state];
  const remaining = current ? Number(current.availability.units_remaining) : 0;
  const showRemaining = state === "open" && remaining > 0 && remaining <= 10;

  return (
    <main className="min-h-dvh">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={36} />
          <Wordmark className="text-2xl text-flour" />
        </Link>
        <nav className="flex items-center gap-2">
          {settings.whatsapp_url && (
            <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-outline hidden sm:inline-flex py-2 text-sm">
              WhatsApp
            </a>
          )}
          {state === "open" && (
            <Link href={orderHref} className="btn-amber py-2.5 px-4 text-sm">
              Order now
            </Link>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="ember-glow relative overflow-hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-5 pb-20 pt-10 text-center sm:px-8 sm:pt-16">
          <div className="rise flicker">
            <LogoMark size={96} />
          </div>
          <h1 className="rise rise-1 mt-6 font-display uppercase leading-[0.85]">
            <span className="block text-[15vw] text-amber sm:text-[6.5rem] md:text-[8rem]">Wood-fired</span>
            <span className="block text-[26vw] text-flour sm:text-[11rem] md:text-[14rem]">Pizza</span>
          </h1>
          <p className="rise rise-2 mt-5 max-w-xl text-base text-flour/75 sm:text-lg">
            Thin, blistered, and a little bit char&rsquo;d. Made to order, boxed hot, gone fast.
          </p>

          <div className="rise rise-3 mt-8 flex flex-col items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber">{h.kicker}</div>
            <div className="text-lg font-medium text-flour sm:text-xl">{h.line}</div>
            {state === "open" && (
              <Link href={orderHref} className="btn-amber mt-2 px-8 py-4 text-lg">
                Order now
              </Link>
            )}
            {showRemaining && <div className="text-sm text-flour/60">Only {remaining} pizza spots left.</div>}
            {state !== "open" && settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-outline mt-2">
                Get the next drop on WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Current sale */}
      {s && data && state !== "hidden" && state !== "completed" && (
        <section className="torn-top bg-char">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber">This sale</div>
                <h2 className="mt-2 font-display text-5xl uppercase leading-none text-flour sm:text-6xl">{s.name}</h2>
                <div className="mt-4 text-xl font-semibold">{fmtDateOnly(s.service_date, "EEEE, MMMM d")}</div>
                <div className="text-flour/70">
                  Pickup {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.pickup_enabled && <span className="rounded-full border border-flour/20 px-3 py-1 text-sm">Pickup</span>}
                  {s.delivery_enabled && (
                    <span className="rounded-full border border-flour/20 px-3 py-1 text-sm">
                      Delivery · {data.zones.map((z) => z.name).join(", ")}
                    </span>
                  )}
                  {[s.cash_enabled && "Cash", s.zelle_enabled && "Zelle", s.card_enabled && "Card"].filter(Boolean).map((p) => (
                    <span key={String(p)} className="rounded-full border border-flour/20 px-3 py-1 text-sm">
                      {p}
                    </span>
                  ))}
                </div>
                {state === "upcoming" && s.ordering_opens_at && (
                  <div className="mt-6 text-flour/70">
                    Ordering opens <b className="text-flour">{fmtDateTime(s.ordering_opens_at, tz)}</b>
                  </div>
                )}
                {s.customer_instructions && <p className="mt-6 text-flour/70">{s.customer_instructions}</p>}
                {state === "open" && (
                  <Link href={orderHref} className="btn-amber mt-8">
                    Start your order
                  </Link>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber">Menu</div>
                <ul className="mt-3 divide-y divide-flour/10">
                  {data.items.map((item) => (
                    <li key={item.smi_id} className="flex items-start justify-between gap-4 py-4">
                      <div>
                        <div className="font-display text-2xl uppercase tracking-wide text-flour">
                          {item.name}
                          {item.is_sold_out && <span className="brush ml-2 align-middle font-body text-xs font-bold tracking-widest">Sold out</span>}
                        </div>
                        {item.description && <p className="mt-1 max-w-md text-sm text-flour/65">{item.description}</p>}
                      </div>
                      <div className="shrink-0 font-display text-2xl text-amber">{formatCents(item.price_cents)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber">How it works</div>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            ["01", "Pick your pies", "Choose from the night's menu. Each sale has its own lineup."],
            ["02", "Pick a time", "Grab a pickup window. Spots are counted in pizzas, so what you see is real."],
            ["03", "Come get it hot", "We text when it's coming out of the oven. Cash, Zelle, or card at checkout."],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-2xl border border-flour/10 bg-white/[0.03] p-6">
              <div className="font-display text-4xl text-amber">{n}</div>
              <div className="mt-2 text-lg font-semibold">{t}</div>
              <p className="mt-1 text-sm text-flour/65">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WhatsApp + contact */}
      <section className="torn-top bg-amber text-coal">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-5xl uppercase leading-none">Don&rsquo;t miss the drop</h2>
            <p className="mt-3 max-w-md font-medium text-coal/80">
              Sale dates, menus, and the order link go out on WhatsApp first. Join the group and you&rsquo;ll never find out after it sold out.
            </p>
            {settings.whatsapp_url && (
              <a
                href={settings.whatsapp_url}
                target="_blank"
                rel="noopener"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-coal px-6 py-3.5 font-bold uppercase tracking-wider text-amber transition hover:bg-char"
              >
                Join the WhatsApp group
              </a>
            )}
          </div>
          <div className="space-y-3 md:justify-self-end">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-coal/70">Pickup</div>
            {settings.pickup_address && (
              <a
                className="block text-xl font-semibold underline-offset-4 hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.pickup_address)}`}
                target="_blank"
                rel="noopener"
              >
                {settings.pickup_address}
              </a>
            )}
            {settings.pickup_instructions && <p className="max-w-sm text-coal/80">{settings.pickup_instructions}</p>}
            <div className="pt-3 text-xs font-bold uppercase tracking-[0.3em] text-coal/70">Contact</div>
            {settings.business_email && (
              <a className="block font-semibold hover:underline" href={`mailto:${settings.business_email}`}>
                {settings.business_email}
              </a>
            )}
            {settings.show_phone_publicly && settings.business_phone && (
              <a className="block font-semibold hover:underline" href={`tel:${settings.business_phone}`}>
                {formatPhone(settings.business_phone)}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 text-center text-sm text-flour/50 sm:px-8">
        <Logo size={40} className="text-flour/80" />
        <div>© {new Date().getFullYear()} {settings.business_name}. Southfield, Michigan.</div>
        <Link href="/admin" className="text-flour/30 hover:text-flour/60">
          Staff
        </Link>
      </footer>
    </main>
  );
}
