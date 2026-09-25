-- The Char'd bank account, as a ledger. Balance = sum(amount_cents).
create type account_txn_kind as enum ('opening_balance', 'deposit', 'expense', 'reimbursement', 'partner_draw', 'adjustment', 'other');

create table account_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_date date not null default current_date,
  amount_cents int not null,               -- signed: deposits +, money out -
  kind account_txn_kind not null,
  description text,
  expense_id uuid references expenses (id) on delete cascade,
  partner_id uuid references admin_users (id),
  service_id uuid references services (id) on delete set null,
  created_by uuid references admin_users (id),
  created_at timestamptz not null default now()
);
create unique index account_txn_expense_kind_idx on account_transactions (expense_id, kind) where expense_id is not null;
create index account_txn_date_idx on account_transactions (txn_date desc, created_at desc);
alter table account_transactions enable row level security;
create policy admin_all on account_transactions for all to authenticated using (is_admin()) with check (is_admin());
grant all on account_transactions to service_role;
grant select, insert, update, delete on account_transactions to authenticated;

-- Expenses drive the ledger automatically:
--   business-paid expense  -> one 'expense' entry (negative)
--   partner reimbursed     -> one 'reimbursement' entry (negative, money to the partner)
create or replace function sync_expense_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  e := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'DELETE' then
    delete from account_transactions where expense_id = e.id;
    return old;
  end if;

  if e.deleted_at is null and e.paid_by = 'business' then
    insert into account_transactions (txn_date, amount_cents, kind, description, expense_id, service_id, created_by)
      values (e.expense_date, -e.amount_cents, 'expense', coalesce(e.description, e.vendor, 'Expense'), e.id, e.service_id, e.created_by)
      on conflict (expense_id, kind) where expense_id is not null
      do update set txn_date = excluded.txn_date, amount_cents = excluded.amount_cents, description = excluded.description, service_id = excluded.service_id;
  else
    delete from account_transactions where expense_id = e.id and kind = 'expense';
  end if;

  if e.deleted_at is null and e.paid_by = 'partner' and e.is_reimbursable and e.reimbursed_at is not null then
    insert into account_transactions (txn_date, amount_cents, kind, description, expense_id, partner_id, service_id, created_by)
      values ((e.reimbursed_at at time zone 'America/Detroit')::date, -e.amount_cents, 'reimbursement', 'Reimbursed: ' || coalesce(e.description, e.vendor, 'expense'), e.id, e.paid_by_admin_id, e.service_id, e.created_by)
      on conflict (expense_id, kind) where expense_id is not null
      do update set txn_date = excluded.txn_date, amount_cents = excluded.amount_cents, description = excluded.description, partner_id = excluded.partner_id;
  else
    delete from account_transactions where expense_id = e.id and kind = 'reimbursement';
  end if;
  return new;
end $$;
create trigger expenses_ledger_sync after insert or update or delete on expenses for each row execute function sync_expense_ledger();

-- Backfill for expenses that already exist.
update expenses set updated_at = updated_at where deleted_at is null;

-- Opening balance as of 2026-09-25.
insert into account_transactions (txn_date, amount_cents, kind, description)
values ('2026-09-25', 354948, 'opening_balance', 'Opening balance');
