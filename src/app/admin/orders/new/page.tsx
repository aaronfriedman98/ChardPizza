import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { getOrderingData } from "@/lib/public";
import { OrderEditor } from "../order-editor";

export const metadata = { title: "New order | Char'd Pizza" };

export default async function NewOrderPage({ searchParams }: PageProps<"/admin/orders/new">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { service, candidates } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);
  const data = service ? await getOrderingData(service.id) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/orders" className="text-sm text-ink/60 hover:text-ink">
          ← Orders
        </Link>
        <h1 className="page-title">New order</h1>
        <p className="text-sm text-ink/60">For phone, text, WhatsApp, or walk-up orders. Same prices and capacity as the website, with an override if you need it.</p>
      </div>
      {candidates.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <Link key={c.id} href={`/admin/orders/new?service=${c.id}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${c.id === service?.id ? "bg-char text-white" : "border border-line bg-white"}`}>
              {c.name} · {c.service_date}
            </Link>
          ))}
        </div>
      )}
      {!service || !data ? (
        <div className="card text-ink/70">
          No published service to take orders for.{" "}
          <Link href="/admin/services" className="text-ember hover:underline">
            Services
          </Link>
        </div>
      ) : (
        <>
          <div className="text-sm text-ink/60">
            Taking an order for <b>{service.name}</b> · {service.service_date}
          </div>
          <OrderEditor data={data} />
        </>
      )}
    </div>
  );
}
