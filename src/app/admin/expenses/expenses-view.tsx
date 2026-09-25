"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminUser, Expense, ExpenseCategory, Service } from "@/lib/types";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { fmtDateOnly } from "@/lib/time";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { deleteExpense, receiptUrl, saveCategory, saveExpense, setReimbursed } from "./actions";

type Svc = Pick<Service, "id" | "name" | "service_date" | "status">;
type Partner = Pick<AdminUser, "id" | "display_name" | "is_partner">;

export function ExpensesView({
  expenses,
  categories,
  services,
  partners,
  me,
  initialServiceId,
}: {
  expenses: Expense[];
  categories: ExpenseCategory[];
  services: Svc[];
  partners: Partner[];
  me: string;
  initialServiceId?: string;
}) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [filterService, setFilterService] = useState(initialServiceId ?? "");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaidBy, setFilterPaidBy] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const svcName = useMemo(() => new Map(services.map((s) => [s.id, `${s.name} · ${s.service_date}`])), [services]);
  const partnerName = useMemo(() => new Map(partners.map((p) => [p.id, p.display_name])), [partners]);

  const shown = expenses.filter(
    (e) =>
      (!filterService || e.service_id === filterService) &&
      (!filterCategory || e.category_id === filterCategory) &&
      (!filterPaidBy || (filterPaidBy === "business" ? e.paid_by === "business" : e.paid_by_admin_id === filterPaidBy)),
  );
  const total = shown.reduce((a, e) => a + e.amount_cents, 0);
  const owed = shown.filter((e) => e.paid_by === "partner" && e.is_reimbursable && !e.reimbursed_at).reduce((a, e) => a + e.amount_cents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="text-sm text-ink/60">Everything the business spends. Tie an expense to a sale night to see that night&rsquo;s profit.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add expense
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Shown" value={formatCents(total)} sub={`${shown.length} expenses`} />
        <Tile label="Owed to partners" value={formatCents(owed)} sub="reimbursable, not yet paid back" tone={owed ? "amber" : undefined} />
        <Tile label="Business paid" value={formatCents(shown.filter((e) => e.paid_by === "business").reduce((a, e) => a + e.amount_cents, 0))} />
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterService} onChange={(e) => setFilterService(e.target.value)} className="input w-auto">
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.service_date}
            </option>
          ))}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input w-auto">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={filterPaidBy} onChange={(e) => setFilterPaidBy(e.target.value)} className="input w-auto">
          <option value="">Paid by anyone</option>
          <option value="business">Business</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      <div className="card divide-y divide-line p-0">
        {shown.length === 0 && <div className="p-5 text-ink/60">No expenses yet.</div>}
        {shown.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-3.5">
            <div className="w-24 shrink-0 text-sm text-ink/60">{fmtDateOnly(e.expense_date, "MMM d, yyyy")}</div>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(e)}>
              <div className="truncate font-semibold">
                {e.category_id ? catName.get(e.category_id) : "Uncategorized"}
                {e.vendor && <span className="font-normal text-ink/60"> · {e.vendor}</span>}
              </div>
              <div className="truncate text-sm text-ink/60">
                {e.description}
                {e.service_id && <span> · {svcName.get(e.service_id) ?? "service"}</span>}
                {e.receipt_url && <span> · 📎</span>}
              </div>
            </button>
            <div className="hidden sm:block text-right text-xs">
              <div className="text-ink/70">{e.paid_by === "business" ? "Business" : (partnerName.get(e.paid_by_admin_id ?? "") ?? "Partner")}</div>
              {e.paid_by === "partner" && e.is_reimbursable && (
                <button
                  disabled={pending}
                  className={`mt-0.5 rounded-full px-2 py-0.5 font-semibold ${e.reimbursed_at ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await setReimbursed(e.id, !e.reimbursed_at);
                      if (r.error) setMessage(r.error);
                    })
                  }
                >
                  {e.reimbursed_at ? "Reimbursed" : "Owed"}
                </button>
              )}
            </div>
            <div className="w-20 shrink-0 text-right font-semibold">{formatCents(e.amount_cents)}</div>
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add expense" : "Edit expense"}>
        {editing !== null && (
          <ExpenseForm
            expense={editing === "new" ? null : editing}
            categories={categories}
            services={services}
            partners={partners}
            me={me}
            defaultServiceId={filterService}
            onDone={() => setEditing(null)}
            onError={setMessage}
          />
        )}
      </Modal>
    </div>
  );
}

function ExpenseForm({
  expense: e,
  categories,
  services,
  partners,
  me,
  defaultServiceId,
  onDone,
  onError,
}: {
  expense: Expense | null;
  categories: ExpenseCategory[];
  services: Svc[];
  partners: Partner[];
  me: string;
  defaultServiceId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    expense_date: e?.expense_date ?? today,
    amount: e ? centsToDollarsInput(e.amount_cents) : "",
    category_id: e?.category_id ?? categories[0]?.id ?? "",
    vendor: e?.vendor ?? "",
    description: e?.description ?? "",
    receipt_url: e?.receipt_url ?? "",
    service_id: e?.service_id ?? defaultServiceId ?? "",
    paid_by: (e?.paid_by ?? "partner") as "business" | "partner",
    paid_by_admin_id: e?.paid_by_admin_id ?? me,
    is_reimbursable: e?.is_reimbursable ?? true,
    notes: e?.notes ?? "",
  });
  const [cats, setCats] = useState(categories);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${form.expense_date.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      set({ receipt_url: path });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function openReceipt() {
    const url = await receiptUrl(form.receipt_url);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await saveExpense({ ...form, id: e?.id });
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Date</span>
          <input type="date" value={form.expense_date} onChange={(ev) => set({ expense_date: ev.target.value })} className="input" required />
        </label>
        <label className="block">
          <span className="label">Amount ($)</span>
          <input inputMode="decimal" value={form.amount} onChange={(ev) => set({ amount: ev.target.value })} className="input text-lg font-bold" placeholder="0.00" required autoFocus />
        </label>
      </div>
      <label className="block">
        <span className="label">Category</span>
        <div className="flex gap-2">
          <select value={form.category_id} onChange={(ev) => set({ category_id: ev.target.value })} className="input">
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost border border-line shrink-0"
            onClick={() => {
              const name = prompt("New category name:");
              if (!name) return;
              startTransition(async () => {
                const r = await saveCategory(name);
                if (r.error) setError(r.error);
                else if (r.id) {
                  setCats((c) => [...c, { id: r.id!, name: name.trim(), sort_order: 999, is_active: true }]);
                  set({ category_id: r.id });
                }
              });
            }}
          >
            + New
          </button>
        </div>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Vendor</span>
          <input value={form.vendor} onChange={(ev) => set({ vendor: ev.target.value })} className="input" placeholder="Costco, Restaurant Depot…" />
        </label>
        <label className="block">
          <span className="label">Service (optional)</span>
          <select value={form.service_id} onChange={(ev) => set({ service_id: ev.target.value })} className="input">
            <option value="">Not tied to a sale</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.service_date}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">What was it</span>
        <input value={form.description} onChange={(ev) => set({ description: ev.target.value })} className="input" placeholder="40 lb mozzarella, 100 boxes…" />
      </label>

      <div className="rounded-xl border border-line p-3 space-y-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-cream p-1 text-sm">
          {(["partner", "business"] as const).map((k) => (
            <button key={k} type="button" onClick={() => set({ paid_by: k })} className={`rounded-md py-1.5 font-semibold ${form.paid_by === k ? "bg-white shadow" : "text-ink/60"}`}>
              {k === "partner" ? "A partner paid" : "Business paid"}
            </button>
          ))}
        </div>
        {form.paid_by === "partner" && (
          <>
            <select value={form.paid_by_admin_id} onChange={(ev) => set({ paid_by_admin_id: ev.target.value })} className="input">
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>Business owes this back</span>
              <Switch checked={form.is_reimbursable} onChange={(v) => set({ is_reimbursable: v })} label="Reimbursable" />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="btn-ghost border border-line cursor-pointer">
          {uploading ? "Uploading…" : form.receipt_url ? "Replace receipt" : "📷 Add receipt"}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(ev) => ev.target.files?.[0] && upload(ev.target.files[0])} />
        </label>
        {form.receipt_url && (
          <>
            <button type="button" className="text-ember hover:underline" onClick={openReceipt}>
              View receipt
            </button>
            <button type="button" className="text-ink/50 hover:underline" onClick={() => set({ receipt_url: "" })}>
              Remove
            </button>
          </>
        )}
      </div>
      <textarea value={form.notes} onChange={(ev) => set({ notes: ev.target.value })} rows={2} className="input" placeholder="Notes (optional)" />

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center justify-between gap-3 pt-1">
        {e ? (
          <button
            type="button"
            className="btn-ghost text-red-700"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this expense?")) return;
              startTransition(async () => {
                const r = await deleteExpense(e.id);
                if (r.error) onError(r.error);
                onDone();
              });
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn-primary" disabled={pending || uploading}>
          {pending ? "Saving..." : e ? "Save" : "Add expense"}
        </button>
      </div>
    </form>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`text-xl font-bold ${tone === "amber" ? "text-amber-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-ink/60">{sub}</div>}
    </div>
  );
}
