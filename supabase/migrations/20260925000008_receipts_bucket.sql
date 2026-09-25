-- Private bucket for expense receipt photos. Admins upload from the browser; the app serves signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "admins manage receipts" on storage.objects;
create policy "admins manage receipts" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

-- Soft delete for expenses so history is never lost.
alter table expenses add column if not exists deleted_at timestamptz;
create index if not exists expenses_live_idx on expenses (expense_date desc) where deleted_at is null;
