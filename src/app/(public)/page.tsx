import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { getCurrentService, getOrderingData, getSettings } from "@/lib/public";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";
import type { PublicState } from "@/lib/service-state";

export const dynamic = "force-dynamic";

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

const MARQUEE = ["Thin crust", "New Haven style", "Italian oven", "A little char", "Made to order", "Sale nights only"];

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
  const stateLine: Record<PublicState, string> = {
    hidden: settings.msg_no_service,
    upcoming: fill(settings.msg_upcoming, vars),
    open: s ? `Ordering open for ${fmtDateOnly(s.service_date, "EEEE")}, ${fmtTime(s.starts_at, tz)} to ${fmtTime(s.ends_at, tz)}` : "",
    paused: settings.msg_paused,
    closed: settings.msg_closed,
    sold_out: settings.msg_sold_out,
    completed: settings.msg_no_service,
  };
  const remaining = current ? Number(current.availability.units_remaining) : 0;
  const showRemaining = state === "open" && remaining > 0 && remaining <= 12;

  return (
    <main className="min-h-dvh">
      {/* Top bar: links · logo · order */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4 sm:px-8 sm:py-5">
          <nav className="hidden items-center gap-7 text-[12px] font-semibold uppercase tracking-[0.2em] text-flour/85 sm:flex">
            <a href="#sale" className="hover:text-gold2">This week</a>
            <a href="#how" className="hover:text-gold2">How it works</a>
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="hover:text-gold2">
                WhatsApp
              </a>
            )}
          </nav>
          <Link href="/" className="col-start-2 flex items-center gap-3">
            <LogoMark size={44} />
            <Wordmark className="text-[30px] sm:text-[34px]" />
          </Link>
          <div className="flex justify-end">
            {state === "open" ? (
              <Link href={orderHref} className="btn-amber px-5 py-2.5 text-[11px]">
                Order now
              </Link>
            ) : (
              settings.whatsapp_url && (
                <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-outline px-5 py-2.5 text-[11px]">
                  WhatsApp
                </a>
              )
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex h-[min(100svh,880px)] items-center justify-center overflow-hidden text-center">
        <video className="absolute inset-0 h-full w-full object-cover object-[center_58%]" autoPlay muted loop playsInline poster="/media/hero-oven.jpg" preload="metadata">
          <source src="/media/hero-oven.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_50%,rgba(22,15,11,0.25)_0%,rgba(22,15,11,0.72)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,15,11,0.55)_0%,transparent_30%,transparent_65%,#160f0b_100%)]" />

        <div className="relative mx-auto max-w-4xl px-5">
          <p className="rise text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">Wood-fired pizza · Southfield, Michigan</p>
          <h1 className="rise rise-1 mt-6 font-display text-[clamp(56px,9.5vw,128px)] leading-[0.92] tracking-[-0.015em] text-flour">
            Thin, crispy,
            <br />
            and <em className="italic">Char&rsquo;d.</em>
          </h1>
          <p className="rise rise-2 mx-auto mt-7 max-w-[52ch] text-[16px] leading-relaxed text-flour2 sm:text-[18px]">
            New Haven-style pies from an Italian oven that runs blazing hot. Little fluff, a lot of crunch, made to order on sale nights.
          </p>
          <div className="rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-3.5">
            {state === "open" ? (
              <Link href={orderHref} className="btn-amber px-9 py-4">
                Order for {s ? fmtDateOnly(s.service_date, "EEEE") : "tonight"}
              </Link>
            ) : (
              <a href="#sale" className="btn-amber px-9 py-4">
                See the next sale
              </a>
            )}
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-outline px-8 py-4">
                Join the WhatsApp
              </a>
            )}
          </div>
          <p className="rise rise-3 mt-6 flex items-center justify-center gap-2.5 text-[13px] text-flour2">
            <span className={`h-1.5 w-1.5 rounded-full ${state === "open" ? "bg-fire shadow-[0_0_0_4px_rgba(224,100,42,0.25)]" : "bg-flour2/50"}`} />
            {stateLine[state]}
            {showRemaining && ` · ${remaining} pizza spots left`}
          </p>
        </div>

        <a href="#sale" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-flour2/70 hover:text-gold2" aria-label="Scroll">
          Scroll
        </a>
      </section>

      {/* Marquee */}
      <div className="overflow-hidden border-y border-goldline bg-wood2/60 py-3">
        <div className="marquee flex w-max whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((t, i) => (
            <span key={i} className="flex items-center gap-8 pr-8 text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">
              {t}
              <span className="h-1 w-1 rounded-full bg-gold/60" />
            </span>
          ))}
        </div>
      </div>

      {/* Current sale + menu */}
      {s && data && state !== "hidden" && state !== "completed" ? (
        <section id="sale" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div className="panel p-8 sm:p-11">
            <div className="eyebrow">This week</div>
            <h2 className="mt-3 font-display text-[48px] leading-[0.95] text-flour sm:text-[60px]">
              {fmtDateOnly(s.service_date, "EEEE,")}
              <br />
              {fmtDateOnly(s.service_date, "MMMM d")}
            </h2>
            <div className="mt-4 text-[15px] leading-7 text-flour2">
              Pickup {fmtTime(s.starts_at, tz)} – {fmtTime(s.ends_at, tz)}
              {settings.pickup_address && (
                <>
                  <br />
                  {settings.pickup_address}
                </>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {s.pickup_enabled && <Chip>Pickup</Chip>}
              {s.delivery_enabled && <Chip>Delivery · {data.zones.map((z) => z.name).join(", ")}</Chip>}
              {s.cash_enabled && <Chip>Cash</Chip>}
              {s.zelle_enabled && <Chip>Zelle</Chip>}
              {s.card_enabled && <Chip>Card</Chip>}
            </div>
            {state === "upcoming" && s.ordering_opens_at && (
              <p className="mt-6 text-[15px] text-flour2">
                Ordering opens <span className="text-flour">{fmtDateTime(s.ordering_opens_at, tz)}</span>.
              </p>
            )}
            {(s.customer_instructions || settings.pickup_instructions) && (
              <p className="mt-6 text-[15px] leading-7 text-flour2">{s.customer_instructions ?? settings.pickup_instructions}</p>
            )}
            {state === "open" && (
              <Link href={orderHref} className="btn-amber mt-8">
                Start your order
              </Link>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <div className="eyebrow">Tonight&rsquo;s menu</div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-flour2/70">16&rdquo; pies</span>
            </div>
            <ul className="mt-2">
              {data.items.map((item) => (
                <li key={item.smi_id} className="flex flex-wrap items-baseline gap-x-4 border-b border-goldline py-6">
                  <span className="font-display text-[34px] leading-none text-flour sm:text-[38px]">{item.name}</span>
                  <span className="flex-1 -translate-y-2 border-b border-dotted border-gold/45" />
                  <span className="font-display text-[30px] leading-none text-gold2">{item.is_sold_out ? "Sold out" : formatCents(item.price_cents)}</span>
                  {item.description && <span className="basis-full pt-2 text-[15px] leading-relaxed text-flour2 sm:max-w-[54ch]">{item.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section id="sale" className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8 sm:py-28">
          <div className="eyebrow">Next sale</div>
          <h2 className="mt-4 font-display text-[44px] leading-none text-flour sm:text-[64px]">{stateLine[state]}</h2>
          {settings.whatsapp_url && (
            <p className="mt-5 text-flour2">
              Sale dates and the order link go out on WhatsApp first.{" "}
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="text-gold2 underline-offset-4 hover:underline">
                Join the group.
              </a>
            </p>
          )}
        </section>
      )}

      <div className="gold-rule mx-auto max-w-7xl" />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="text-center">
          <div className="eyebrow">How it works</div>
          <h2 className="mt-3 font-display text-[40px] leading-none text-flour sm:text-[56px]">Three steps. No app.</h2>
        </div>
        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {[
            ["01", "Choose your pies", "From the night's menu. It changes, so look before you order."],
            ["02", "Pick a time", "Spots are counted in pizzas, not orders, so what you see is real."],
            ["03", "Come get it hot", "We text the moment it's coming out. Boxes wait for no one."],
          ].map(([n, t, d]) => (
            <div key={n} className="border-t border-goldline pt-6">
              <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">{n}</div>
              <h3 className="mt-3 font-display text-[30px] leading-none text-flour">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-flour2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WhatsApp + find us */}
      <section className="border-y border-goldline bg-wood2/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="eyebrow">Don&rsquo;t miss the drop</div>
            <h2 className="mt-3 max-w-[16ch] font-display text-[42px] leading-[0.95] text-flour sm:text-[60px]">Sale nights are announced on WhatsApp first.</h2>
            <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-flour2">Dates, the menu, and the order link go out to the group. By the time it&rsquo;s anywhere else, the good slots are gone.</p>
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-amber mt-8">
                Join the WhatsApp group
              </a>
            )}
          </div>
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-1">
            <div>
              <div className="eyebrow">Pickup</div>
              {settings.pickup_address && (
                <a
                  className="mt-3 block font-display text-[26px] leading-tight text-flour underline-offset-4 hover:underline"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.pickup_address)}`}
                  target="_blank"
                  rel="noopener"
                >
                  {settings.pickup_address}
                </a>
              )}
              {settings.pickup_instructions && <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed text-flour2">{settings.pickup_instructions}</p>}
            </div>
            <div>
              <div className="eyebrow">Contact</div>
              {settings.business_email && (
                <a className="mt-3 block text-[15px] text-flour hover:text-gold2" href={`mailto:${settings.business_email}`}>
                  {settings.business_email}
                </a>
              )}
              {settings.show_phone_publicly && settings.business_phone && (
                <a className="block text-[15px] text-flour hover:text-gold2" href={`tel:${settings.business_phone}`}>
                  {formatPhone(settings.business_phone)}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-12 text-center sm:flex-row sm:justify-between sm:px-8">
        <span className="flex items-center gap-3">
          <LogoMark size={36} />
          <Wordmark className="text-[24px]" />
        </span>
        <span className="text-[12px] uppercase tracking-[0.2em] text-flour2/70">© {new Date().getFullYear()} {settings.business_name} · Southfield, Michigan</span>
        <Link href="/admin" className="text-[11px] uppercase tracking-[0.2em] text-flour2/40 hover:text-flour2">
          Staff
        </Link>
      </footer>
    </main>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="border border-goldline px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-flour2">{children}</span>;
}
