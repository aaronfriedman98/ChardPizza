import { PageSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <PageSkeleton stats={4} rows={8} />;
}
