import { PageSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <PageSkeleton stats={5} rows={6} />;
}
