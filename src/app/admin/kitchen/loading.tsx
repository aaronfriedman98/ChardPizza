import { PageSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <PageSkeleton stats={0} rows={0} cards={6} />;
}
