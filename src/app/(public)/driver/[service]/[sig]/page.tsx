import { notFound } from "next/navigation";
import { driverOk } from "@/lib/driver";
import { DriverNight } from "./driver-night";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deliveries | Char'd Pizza", robots: { index: false, follow: false } };

// Link for one sale night. Older links sent before the every-week link keep working.
export default async function DriverPage({ params }: { params: Promise<{ service: string; sig: string }> }) {
  const { service: serviceId, sig } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(serviceId) || !driverOk(serviceId, sig)) notFound();
  return <DriverNight serviceId={serviceId} />;
}
