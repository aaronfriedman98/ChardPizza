import { redirect } from "next/navigation";
import { getCurrentService, getOrderingData } from "@/lib/public";
import { OrderFlow } from "./order-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order | Char'd Pizza" };

export default async function OrderPage({ searchParams }: PageProps<"/order">) {
  const { src } = await searchParams;
  const current = await getCurrentService();
  if (!current || current.state !== "open") redirect("/");
  const data = await getOrderingData(current.service.id);
  if (!data || data.state !== "open") redirect("/");
  return <OrderFlow data={data} source={typeof src === "string" ? src.slice(0, 40) : "website"} />;
}
