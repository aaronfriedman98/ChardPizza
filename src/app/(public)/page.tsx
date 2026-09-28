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
    open: s ? `Ordering open · ${fmtDateOnly(s.service_date, "EEEE")} ${fmtTime(s.starts_at, tz)} to ${fmtTime(s.ends_at, tz)}` : "",
    paused: settings.msg_paused,
    closed: settings.msg_closed,
    sold_out: settings.msg_sold_out,
    completed: settings.msg_no_service,
  };
  const remaining = current ? Number(current.availability.units_remaining) : 0;
  const showRemaining = state === "open" && remaining > 0 && remaining <= 12;
  const ctaLabel = s ? `Order for ${fmtDateOnly(s.service_date, "EEEE")}` : "Order now";

  return (
    <main className="min-h-dvh">
      {/* Hero with the oven */}
      <section className="relative flex h-[min(92svh,820px)] items-end overflow-hidden">
        <video className="absolute inset-0 h-full w-full object-cover object-[center_60%]" autoPlay muted loop playsInline poster="/media/hero-oven.jpg" preload="metadata">
          <source src="/media/hero-oven.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,15,11,0.6)_0%,rgba(22,15,11,0.15)_35%,rgba(22,15,11,0.6)_70%,#160f0b_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_55%,transparent_0,rgba(22,15,11,0.55)_100%)]" />

        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-10">
          <Link href="/" className="flex items-center gap-3 text-flour">
            <LogoMark size={34} />
            <Wordmark className="text-3xl" />
          </Link>
          <nav className="flex items-center gap-3">
            {settings.whatsapp_url && (
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="hidden text-[13px] font-medium uppercase tracking-[0.14em] text-flour2 hover:text-gold2 sm:inline">
                WhatsApp
              </a>
            )}
            {state === "open" && (
              <Link href={orderHref} className="btn-amber px-5 py-2.5 text-[12px]">
                Order now
              </Link>
            )}
          </nav>
        </header>

        <div className="relative w-full px-5 pb-16 sm:px-10 sm:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="rise eyebrow">Wood-fired · Southfield, Michigan</div>
            <h1 className="rise rise-1 mt-4 max-w-[13ch] font-display text-[clamp(54px,9vw,104px)] font-medium leading-[0.98] tracking-[-0.01em] text-flour">
              Thin, crispy,
              <br />
              and <em className="italic font-semibold">Char&rsquo;d.</em>
            </h1>
            <p className="rise rise-2 mt-5 max-w-[48ch] text-[17px] leading-relaxed text-flour2 sm:text-lg">
              New Haven-style pies out of an Italian oven that runs blazing hot. Little fluff, a lot of crunch, made to order on sale nights.
            </p>
            <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-4">
              {state === "open" && (
                <Link href={orderHref} className="btn-amber">
                  {ctaLabel}
                </Link>
              )}
              {settings.whatsapp_url && (
                <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-outline">
                  Join the WhatsApp
                </a>
              )}
              <div className="flex items-center gap-2.5 text-sm text-flour2">
                <span className={`h-2 w-2 rounded-full ${state === "open" ? "bg-fire shadow-[0_0_0_5px_rgba(224,100,42,0.2)]" : "bg-flour2/50"}`} />
                {stateLine[state]}
                {showRemaining && ` · ${remaining} pizza spots left`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="gold-rule mx-auto max-w-6xl" />

      {/* Current sale + menu */}
      {s && data && state !== "hidden" && state !== "completed" ? (
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-10 sm:py-20 md:grid-cols-[0.95fr_1.05fr] md:gap-14">
          <div className="panel p-7 sm:p-10">
            <div className="eyebrow">This sale</div>
            <h2 className="mt-3 font-display text-[44px] font-medium leading-none text-flour sm:text-[52px]">
              {fmtDateOnly(s.service_date, "EEEE,")}
              <br />
              {fmtDateOnly(s.service_date, "MMMM d")}
            </h2>
            <div className="mt-3 text-[15px] leading-7 text-flour2">
              Pickup {fmtTime(s.starts_at, tz)} – {fmtTime(s.ends_at, tz)}
              {settings.pickup_address && (
                <>
                  <br />
                  {settings.pickup_address}
                </>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
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
              <Link href={orderHref} className="btn-amber mt-7">
                Start your order
              </Link>
            )}
          </div>

          <div>
            <div className="eyebrow mb-2">Tonight&rsquo;s menu</div>
            <ul>
              {data.items.map((item) => (
                <li key={item.smi_id} className="flex flex-wrap items-baseline gap-x-3.5 border-b border-goldline py-5">
                  <span className="font-display text-[30px] font-medium leading-none text-flour sm:text-[32px]">{item.name}</span>
                  <span className="flex-1 -translate-y-2 border-b border-dotted border-gold/45" />
                  <span className="font-display text-[26px] text-gold2">{item.is_sold_out ? "Sold out" : formatCents(item.price_cents)}</span>
                  {item.description && <span className="basis-full text-[14.5px] leading-relaxed text-flour2 sm:max-w-[52ch]">{item.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-10 sm:py-24">
          <div className="eyebrow">Next sale</div>
          <h2 className="mt-3 font-display text-[40px] font-medium leading-none text-flour sm:text-[52px]">{stateLine[state]}</h2>
          {settings.whatsapp_url && (
            <p className="mt-4 text-flour2">
              Sale dates and the order link go out on WhatsApp first.{" "}
              <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="text-gold2 underline-offset-4 hover:underline">
                Join the group.
              </a>
            </p>
          )}
        </section>
      )}

      <div className="gold-rule mx-auto max-w-6xl" />

      {/* How it works */}
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-3 sm:gap-11 sm:px-10 sm:py-20">
        {[
          ["I", "Choose your pies", "From the night's menu. It changes, so look before you order."],
          ["II", "Pick a time", "Spots are counted in pizzas, not orders, so what you see is real."],
          ["III", "Come get it hot", "We text the moment it's coming out. Boxes wait for no one."],
        ].map(([n, t, d]) => (
          <div key={n}>
            <div className="font-display text-[54px] font-medium leading-none text-gold">{n}</div>
            <h3 className="mt-2 font-display text-2xl font-semibold text-flour">{t}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-flour2">{d}</p>
          </div>
        ))}
      </section>

      <div className="gold-rule mx-auto max-w-6xl" />

      {/* Find us */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-10 sm:py-20 md:grid-cols-2">
        <div>
          <div className="eyebrow">Don&rsquo;t miss the drop</div>
          <h2 className="mt-3 font-display text-[40px] font-medium leading-none text-flour sm:text-[48px]">Sale nights are announced on WhatsApp first.</h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-flour2">Dates, the menu, and the order link go out to the group. By the time it&rsquo;s anywhere else, the good slots are gone.</p>
          {settings.whatsapp_url && (
            <a href={settings.whatsapp_url} target="_blank" rel="noopener" className="btn-amber mt-7">
              Join the WhatsApp group
            </a>
          )}
        </div>
        <div className="space-y-6 md:justify-self-end">
          <div>
            <div className="eyebrow">Pickup</div>
            {settings.pickup_address && (
              <a
                className="mt-2 block font-display text-2xl font-medium text-flour underline-offset-4 hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.pickup_address)}`}
                target="_blank"
                rel="noopener"
              >
                {settings.pickup_address}
              </a>
            )}
            {settings.pickup_instructions && <p className="mt-1 max-w-[40ch] text-[15px] text-flour2">{settings.pickup_instructions}</p>}
          </div>
          <div>
            <div className="eyebrow">Contact</div>
            {settings.business_email && (
              <a className="mt-2 block text-flour hover:text-gold2" href={`mailto:${settings.business_email}`}>
                {settings.business_email}
              </a>
            )}
            {settings.show_phone_publicly && settings.business_phone && (
              <a className="block text-flour hover:text-gold2" href={`tel:${settings.business_phone}`}>
                {formatPhone(settings.business_phone)}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 pb-14 pt-8 text-center text-[13px] tracking-[0.06em] text-flour2/80 sm:flex-row sm:justify-between sm:px-10">
        <span className="flex items-center gap-2">
          <LogoMark size={22} />
          <Wordmark className="text-xl text-flour" />
        </span>
        <span>© {new Date().getFullYear()} {settings.business_name} · Southfield, Michigan</span>
        <Link href="/admin" className="text-flour2/40 hover:text-flour2">
          Staff
        </Link>
      </footer>
    </main>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="border border-goldline px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-flour2">{children}</span>;
}
