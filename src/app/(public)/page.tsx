import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { CountUp, Embers, Reveal, ScrollFx } from "@/components/public/motion";
import { getCurrentService, getOrderingData, getSettings } from "@/lib/public";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";
import type { PublicState } from "@/lib/service-state";

export const dynamic = "force-dynamic";

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

const STRIP = ["New Haven style", "16 inch pies", "Made to order", "Sale nights only", "Southfield, Michigan", "Blazing hot Italian oven"];

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
  const total = s ? Number(s.pizza_capacity_total) : 0;
  const showRemaining = state === "open" && remaining > 0 && remaining <= 12;
  // Capacity is only hinted at near the end of the night, and the total is never printed.
  const showMeter = showRemaining && total > 0;

  return (
    <main className="min-h-dvh">
      <ScrollFx />

      {/* Top bar: floats over the oven, turns solid walnut on scroll. */}
      <header className="site-header">
        <div className="site-header-inner mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4 sm:px-8 sm:py-5">
          <nav className="hidden items-center gap-7 text-[12px] font-bold uppercase tracking-[0.2em] text-flour/85 sm:flex">
            <a href="#sale" className="nav-link hover:text-gold2">This week</a>
            <a href="#how" className="nav-link hover:text-gold2">How it works</a>
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="nav-link hover:text-gold2">
                WhatsApp
              </a>
            )}
          </nav>
          <Link href="/" className="header-mark col-start-2 flex items-center gap-3">
            <LogoMark size={46} />
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

      {/* Hero: the oven, unobstructed. Only the mark and one line sit on it, low. */}
      <section className="relative h-[min(100svh,860px)] overflow-hidden">
        <video
          className="hero-video absolute inset-0 h-full w-full object-cover object-[center_55%]"
          autoPlay
          muted
          loop
          playsInline
          poster="/media/hero-oven.jpg"
          preload="metadata"
        >
          <source src="/media/hero-oven.mp4" type="video/mp4" />
        </video>
        <div className="hero-glow" />
        <Embers />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,15,11,0.5)_0%,transparent_26%)]" />

        {/* Lower third: the oven stays clear above; the message rides a band across the bottom. */}
        <div className="hero-band absolute inset-x-0 bottom-0">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 sm:py-10 md:grid-cols-[1.25fr_1fr] md:items-center md:gap-12">
            <div>
              <p className="band-item eyebrow">New Haven style · Italian oven · Southfield</p>
              <h1 className="band-item mt-3 font-display text-[clamp(40px,5.6vw,80px)] font-medium leading-[0.95] tracking-[-0.01em] text-flour">
                <span className="headline-word"><span>Thin,</span></span>{" "}
                <span className="headline-word"><span>crispy,</span></span>{" "}
                <span className="headline-word"><span>and</span></span>{" "}
                <span className="headline-word"><span><em className="underline-draw italic font-normal">Char&rsquo;d.</em></span></span>
              </h1>
            </div>
            <div className="band-item md:border-l md:border-goldline md:pl-10">
              <p className="max-w-[44ch] text-[15px] leading-relaxed text-flour2 sm:text-[16px]">
                Pies out of an oven that runs blazing hot. Little fluff, a lot of crunch, a proper edge. Made to order on sale nights, boxed the minute they come out.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3.5">
                {state === "open" ? (
                  <Link href={orderHref} className="btn-amber px-7 py-3.5">
                    Order for {s ? fmtDateOnly(s.service_date, "EEEE") : "tonight"}
                  </Link>
                ) : (
                  <a href="#sale" className="btn-amber px-7 py-3.5">
                    See the next sale
                  </a>
                )}
                <span className="flex items-center gap-2.5 text-[12px] uppercase tracking-[0.2em] text-flour2">
                  <span className={`h-1.5 w-1.5 rounded-full ${state === "open" ? "live-dot bg-fire" : "bg-flour2/50"}`} />
                  {stateLine[state]}
                  {showRemaining && ` · ${remaining} spots left`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gold strip */}
      <div className="strip py-3.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold2">
        <div className="strip-track marquee">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex" aria-hidden={rep === 1}>
              {STRIP.map((t) => (
                <span key={t} className="strip-item">
                  {t}
                  <span className="strip-dot" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Current sale + menu */}
      {s && data && state !== "hidden" && state !== "completed" ? (
        <section id="sale" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <Reveal className="reveal-left">
            <div className="panel p-8 sm:p-11">
              <div className="flex items-center justify-between">
                <div className="eyebrow">This week</div>
                {state === "open" && (
                  <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-fire">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-fire" />
                    Live
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-display text-[46px] font-medium leading-[0.95] text-flour sm:text-[58px]">
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
              {showMeter && (
                <div className="mt-7">
                  <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.2em] text-flour2/80">
                    <span>
                      Only <CountUp to={remaining} className="text-gold2" /> {remaining === 1 ? "pie" : "pies"} left
                    </span>
                    <span>{Math.round(((total - remaining) / total) * 100)}% claimed</span>
                  </div>
                  <div className="meter mt-2" style={{ ["--fill" as string]: Math.max(0.02, remaining / total) }}>
                    <span />
                  </div>
                </div>
              )}
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
          </Reveal>

          <div>
            <Reveal className="flex items-baseline justify-between">
              <div className="eyebrow">Tonight&rsquo;s menu</div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-flour2/70">16&rdquo; pies</span>
            </Reveal>
            <ul className="mt-2">
              {data.items.map((item, i) => (
                <Reveal as="li" key={item.smi_id} delay={80 * i} className="menu-row flex flex-wrap items-baseline gap-x-4 border-b border-goldline py-6">
                  <span className="font-display text-[32px] font-medium leading-none text-flour sm:text-[36px]">{item.name}</span>
                  <span className="menu-leader flex-1 -translate-y-2 border-b border-dotted border-gold/45" />
                  <span className={`menu-price font-display text-[28px] leading-none ${item.is_sold_out ? "text-flour2/60 line-through" : "text-gold2"}`}>
                    {item.is_sold_out ? "Sold out" : formatCents(item.price_cents)}
                  </span>
                  {item.description && <span className="basis-full pt-2 text-[15px] leading-relaxed text-flour2 sm:max-w-[54ch]">{item.description}</span>}
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section id="sale" className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8 sm:py-28">
          <Reveal>
            <div className="eyebrow">Next sale</div>
            <h2 className="mt-4 font-display text-[44px] font-medium leading-none text-flour sm:text-[64px]">{stateLine[state]}</h2>
            {settings.whatsapp_url && (
              <p className="mt-5 text-flour2">
                Sale dates and the order link go out on WhatsApp first.{" "}
                <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="text-gold2 underline-offset-4 hover:underline">
                  Join the group.
                </a>
              </p>
            )}
          </Reveal>
        </section>
      )}

      <div className="gold-rule mx-auto max-w-7xl" />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <Reveal>
          <div className="eyebrow">How it works</div>
        </Reveal>
        <div className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {[
            ["01", "Choose your pies", "From the night's menu. It changes, so look before you order."],
            ["02", "Pick a time", "Spots are counted in pizzas, not orders, so what you see is real."],
            ["03", "Come get it hot", "We text the moment it's coming out. Boxes wait for no one."],
          ].map(([n, t, d], i) => (
            <Reveal key={n} delay={120 * i} className="step border-t border-goldline pt-6">
              <div className="step-num font-brand text-[28px] text-gold">{n}</div>
              <h3 className="mt-2 font-display text-[30px] font-medium leading-none text-flour">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-flour2">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* WhatsApp + find us */}
      <section className="relative overflow-hidden border-y border-goldline bg-wood2/60">
        <LogoMark size={720} color="#e3c783" className="watermark" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[1.2fr_0.8fr]">
          <Reveal>
            <div className="eyebrow">Don&rsquo;t miss the drop</div>
            <h2 className="mt-3 max-w-[16ch] font-display text-[42px] font-medium leading-[0.95] text-flour sm:text-[60px]">Sale nights are announced on WhatsApp first.</h2>
            <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-flour2">Dates, the menu, and the order link go out to the group. By the time it&rsquo;s anywhere else, the good slots are gone.</p>
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-amber mt-8">
                Join the WhatsApp group
              </a>
            )}
          </Reveal>
          <Reveal delay={150} className="grid gap-8 sm:grid-cols-2 md:grid-cols-1">
            <div>
              <div className="eyebrow">Pickup</div>
              {settings.pickup_address && (
                <a
                  className="mt-3 block font-display text-[26px] font-medium leading-tight text-flour underline-offset-4 hover:underline"
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
          </Reveal>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-12 text-center sm:flex-row sm:justify-between sm:px-8">
        <span className="flex items-center gap-3">
          <LogoMark size={40} />
          <Wordmark className="text-[26px]" />
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
