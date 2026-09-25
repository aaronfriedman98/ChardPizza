"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import type { MenuItem } from "@/lib/types";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { Switch, SwitchField } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { deleteMenuItem, reorderMenuItems, saveMenuItem, setMenuItemActive } from "./actions";

const CATEGORY_SUGGESTIONS = ["Pizza", "Sides", "Soup", "Drinks", "Dessert"];

export function MenuEditor({ items }: { items: MenuItem[] }) {
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const visible = useMemo(() => (showInactive ? items : items.filter((i) => i.is_active)), [items, showInactive]);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  function move(item: MenuItem, dir: -1 | 1) {
    const index = items.findIndex((i) => i.id === item.id);
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const r = await reorderMenuItems(next.map((i) => i.id));
      if (r.error) setMessage(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <Switch checked={showInactive} onChange={setShowInactive} label="Show inactive items" />
          Show inactive
        </label>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add item
        </button>
      </div>

      {message && (
        <p className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2 cursor-pointer" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      {visible.length === 0 && <div className="card text-ink/60">No menu items yet. Add your first pie.</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <div key={item.id} className={`card flex flex-col gap-3 ${item.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <button className="text-left min-w-0 flex-1" onClick={() => setEditing(item)}>
                <div className="text-[11px] uppercase tracking-wide text-ink/50">{item.category}</div>
                <div className="text-lg font-bold leading-tight">{item.name}</div>
                <div className="text-ember font-semibold">{formatCents(item.default_price_cents)}</div>
              </button>
              <Switch
                checked={item.is_active}
                label={`${item.name} active`}
                onChange={(v) =>
                  startTransition(async () => {
                    const r = await setMenuItemActive(item.id, v);
                    if (r.error) setMessage(r.error);
                  })
                }
              />
            </div>
            {item.description && <p className="text-sm text-ink/70 line-clamp-3">{item.description}</p>}
            <div className="mt-auto flex items-center justify-between text-xs text-ink/50">
              <span>
                {item.capacity_units === 0
                  ? "No oven capacity"
                  : `${item.capacity_units} pizza ${item.capacity_units === 1 ? "unit" : "units"}`}
              </span>
              <span className="flex gap-1">
                <button onClick={() => move(item, -1)} disabled={pending} className="px-1.5 py-0.5 rounded hover:bg-cream" aria-label="Move up">▲</button>
                <button onClick={() => move(item, 1)} disabled={pending} className="px-1.5 py-0.5 rounded hover:bg-cream" aria-label="Move down">▼</button>
                <button onClick={() => setEditing(item)} className="px-2 py-0.5 rounded hover:bg-cream font-medium text-ink/70">Edit</button>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add menu item" : "Edit menu item"}>
        {editing !== null && (
          <ItemForm
            item={editing === "new" ? null : editing}
            categories={Array.from(new Set([...CATEGORY_SUGGESTIONS, ...categories]))}
            onDone={() => setEditing(null)}
            onError={setMessage}
          />
        )}
      </Modal>
    </div>
  );
}

function ItemForm({
  item,
  categories,
  onDone,
  onError,
}: {
  item: MenuItem | null;
  categories: string[];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [state, action] = useActionState(saveMenuItem, undefined);
  const [pending, startTransition] = useTransition();
  const [units, setUnits] = useState<number>(item?.capacity_units ?? 1);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <label className="block">
        <span className="label">Name</span>
        <input name="name" defaultValue={item?.name ?? ""} className="input" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Description</span>
        <textarea name="description" defaultValue={item?.description ?? ""} rows={3} className="input" placeholder="What is on it, as customers should read it." />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="label">Default price ($)</span>
          <input name="price" inputMode="decimal" defaultValue={item ? centsToDollarsInput(item.default_price_cents) : ""} className="input" placeholder="22.00" required />
        </label>
        <label className="block">
          <span className="label">Category</span>
          <input name="category" list="menu-categories" defaultValue={item?.category ?? "Pizza"} className="input" required />
          <datalist id="menu-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="rounded-xl border border-line p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Counts toward pizza capacity</div>
            <div className="text-sm text-ink/60">A pie uses the oven. Sides and soup usually do not.</div>
          </div>
          <Switch checked={units > 0} label="Counts toward capacity" onChange={(v) => setUnits(v ? 1 : 0)} />
        </div>
        {units > 0 && (
          <label className="block">
            <span className="label">Pizza units per item</span>
            <input
              name="capacity_units"
              type="number"
              step="0.25"
              min={0.25}
              max={20}
              value={units}
              onChange={(e) => setUnits(parseFloat(e.target.value) || 0)}
              className="input"
            />
            <span className="mt-1 block text-xs text-ink/50">1 for a normal pie. 0.5 for a half pie, 2 for a double, and so on.</span>
          </label>
        )}
        {units === 0 && <input type="hidden" name="capacity_units" value="0" />}
      </div>

      <label className="block">
        <span className="label">Internal code (optional)</span>
        <input name="sku" defaultValue={item?.sku ?? ""} className="input" placeholder="e.g. CHARD" />
      </label>
      <SwitchField name="is_active" defaultChecked={item?.is_active ?? true} label="Active" hint="Inactive items cannot be added to new services." />
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {item ? (
          <button
            type="button"
            disabled={pending}
            className="btn-ghost text-red-700"
            onClick={() => {
              if (!confirm(`Delete ${item.name}?`)) return;
              startTransition(async () => {
                const r = await deleteMenuItem(item.id);
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
        <SubmitButton>{item ? "Save" : "Add item"}</SubmitButton>
      </div>
    </form>
  );
}
