"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addPerson, removePerson, claimMember, saveExpense, createGroup, type FormState } from "@/app/actions";
import { CURRENCY, fmt, type SplitMode } from "@/lib/money";
import { Icon } from "@/components/icon";

type Member = { id: string; userId: string | null; name: string };
export type EditingExpense = {
  id: string; description: string; amountCents: number; paidBy: string; paymentMethod: string;
  shares: Record<string, number>;
};

// ---------- mobile tab shell ----------

type Tab = "balances" | "expenses" | "add" | "activity" | "group";

/** Phones: a bottom tab bar that shows one section group at a time (sections carry data-sec;
 *  CSS keyed on data-tab does the showing/hiding). Desktop ignores all this and shows the grid. */
export function TabShell({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const editing = params.get("edit");
  const [tab, setTab] = useState<Tab>("balances");
  // Editing (an ?edit= URL) forces the Add tab without setState; clearing it falls back to
  // whatever tab the user was on (Expenses, since edit is only reachable from there).
  const activeTab = editing ? "add" : tab;
  const go = useCallback((t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); }, []);

  // ExpenseForm fires this after a successful add (setState in a listener, not in an effect body).
  useEffect(() => {
    const onAdded = () => setTab("expenses");
    window.addEventListener("batwara:added", onAdded);
    return () => window.removeEventListener("batwara:added", onAdded);
  }, []);

  const btn = (id: Tab, icon: string, label: string) => (
    <button className="tab-btn" aria-current={activeTab === id} onClick={() => go(id)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );

  return (
    <>
      <div data-tabroot data-tab={activeTab}>{children}</div>
      <nav className="tabbar md:hidden no-print" aria-label="Sections">
        {btn("balances", "account_balance_wallet", "Balances")}
        {btn("expenses", "receipt_long", "Expenses")}
        <button className="tab-add" aria-label="Add expense" onClick={() => go("add")}><Icon name="add" /></button>
        {btn("activity", "history", "Activity")}
        {btn("group", "group", "Group")}
      </nav>
    </>
  );
}

// ---------- top bar ----------

export function GroupSwitcher({ groups, current }: { groups: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  useEffect(() => { document.cookie = `last_group=${current}; path=/; max-age=31536000; samesite=lax`; }, [current]);
  return (
    <select value={current} onChange={(e) => router.push(`/groups/${e.target.value}`)} aria-label="Switch group"
      className="md:!w-auto md:max-w-[260px] font-bold truncate">
      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  );
}

export function NewGroupButton() {
  function create() {
    const name = prompt("Group name?")?.trim();
    if (!name) return;
    const fd = new FormData();
    fd.set("name", name);
    createGroup(fd);
  }
  return <button onClick={create} className="menu-item inline-flex items-center gap-2"><Icon name="group_add" /> New group</button>;
}

/** Overflow menu: native <details>, closes on outside tap / Escape like a real menu. */
export function Menu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (d?.open && (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !d.contains(e.target as Node))) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return (
    <details ref={ref} className="relative no-print shrink-0">
      <summary className="btn-small cursor-pointer inline-flex items-center" aria-label="More actions"><Icon name="more_horiz" /></summary>
      {/* items close the menu after they run (next tick, so a form submit isn't cut off) */}
      <div className="menu" onClick={() => setTimeout(() => ref.current && (ref.current.open = false))}>{children}</div>
    </details>
  );
}

export function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}/join/${code}`;
    if (navigator.share) return navigator.share({ title: "Join my group on Batwara", url }).catch(() => {});
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt("Copy this invite link:", url); }
  }
  return (
    <button onClick={share} className="btn-small inline-flex items-center gap-1">
      <Icon name={copied ? "check" : "link"} />{copied ? "Copied" : "Invite"}
    </button>
  );
}

export function PrintButton() {
  return <button onClick={() => window.print()} className="menu-item inline-flex items-center gap-2"><Icon name="download" /> Save as PDF</button>;
}

/** Keeps everyone's view fresh. ponytail: polling, not Supabase Realtime; switch if 10s lag matters. */
const onConnectivity = (cb: () => void) => {
  addEventListener("online", cb);
  addEventListener("offline", cb);
  return () => { removeEventListener("online", cb); removeEventListener("offline", cb); };
};

export function AutoRefresh() {
  const router = useRouter();
  const online = useSyncExternalStore(onConnectivity, () => navigator.onLine, () => true);
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && navigator.onLine && router.refresh();
    const t = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    addEventListener("online", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
      removeEventListener("online", refresh);
    };
  }, [router]);
  return online ? null : <div role="status" className="banner no-print">You&apos;re offline. Changes won&apos;t save until you reconnect.</div>;
}

// ---------- people ----------

export function PeopleCard({ groupId, members, canClaim }: { groupId: string; members: Member[]; canClaim: boolean }) {
  const [addState, addAction, adding] = useActionState<FormState, FormData>(addPerson, {});
  const [rmState, rmAction] = useActionState<FormState, FormData>(removePerson, {});
  const [claimState, claimAction] = useActionState<FormState, FormData>(claimMember, {});
  const ghosts = members.filter((m) => !m.userId);
  const error = addState.error || rmState.error || claimState.error;

  return (
    <section className="card">
      <h2>People <span className="badge">{members.length}</span></h2>
      <form action={addAction} key={addState.ok} className="flex gap-2 mb-2 no-print">
        <input type="hidden" name="groupId" value={groupId} />
        <input name="name" maxLength={60} placeholder="Add a name (no account needed)…" aria-label="Person's name" />
        <button className="btn" disabled={adding}>Add</button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) =>
          m.userId ? (
            <span key={m.id} className="chip linked" title="Signed-up member">{m.name}</span>
          ) : (
            <form key={m.id} action={rmAction} className="chip">
              {m.name}
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="memberId" value={m.id} />
              <button className="icon-btn no-print inline-flex items-center" aria-label={`Remove ${m.name}`}><Icon name="close" size={18} /></button>
            </form>
          ),
        )}
      </div>
      {canClaim && ghosts.length > 0 && (
        <form action={claimAction} className="flex flex-wrap items-center gap-2 mt-3 no-print">
          <input type="hidden" name="groupId" value={groupId} />
          <span className="mini-lbl">Already listed here? Pick your name:</span>
          <select name="memberId" className="!w-auto">{ghosts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <button className="btn-small">This is me</button>
        </form>
      )}
      <p className="err mt-1.5" role="alert">{error}</p>
    </section>
  );
}

// ---------- expense form ----------

const HINT: Record<Exclude<SplitMode, "equal">, string> = { exact: CURRENCY, percent: "%", shares: "×" };

export function ExpenseForm({ groupId, members, me, editing }: { groupId: string; members: Member[]; me: string; editing?: EditingExpense }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpense, {});
  // Track who's *excluded*, so people added later are included by default.
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(editing ? members.filter((m) => !(m.id in editing.shares)).map((m) => m.id) : []),
  );
  const [mode, setMode] = useState<SplitMode>(() => {
    if (!editing) return "equal";
    const v = Object.values(editing.shares);
    return Math.max(...v) - Math.min(...v) <= 1 ? "equal" : "exact";
  });
  // On a successful add, tell the TabShell to switch to the Expenses tab.
  useEffect(() => { if (state.ok) window.dispatchEvent(new Event("batwara:added")); }, [state.ok]);

  const selected = members.filter((m) => !excluded.has(m.id));
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setExcluded(selected.length === members.length ? new Set(members.map((m) => m.id)) : new Set());
  const defaultValue = (id: string) =>
    mode === "shares" ? "1" : mode === "exact" && editing?.shares[id] ? (editing.shares[id] / 100).toFixed(2) : "";

  return (
    <section className="card no-print">
      <h2>{editing ? "Edit Expense" : "Add Expense"}</h2>
      {members.length === 0 ? <p className="empty">Add people first.</p> : (
        <form action={action} key={state.ok} className="flex flex-col gap-2.5">
          <input type="hidden" name="groupId" value={groupId} />
          {editing && <input type="hidden" name="expenseId" value={editing.id} />}
          <div className="grid grid-cols-2 md:grid-cols-[2.2fr_1fr_1.2fr_0.9fr] gap-2">
            <input name="description" required maxLength={120} defaultValue={editing?.description}
              placeholder="Description (e.g., Dinner at PQR)" aria-label="Description" className="col-span-2 md:col-span-1" />
            <input name="amount" required inputMode="decimal" defaultValue={editing ? (editing.amountCents / 100).toFixed(2) : ""}
              placeholder={`Amount ${CURRENCY}`} aria-label="Amount" />
            <select name="paidBy" defaultValue={editing?.paidBy ?? me} aria-label="Paid by">
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select name="paymentMethod" defaultValue={editing?.paymentMethod ?? "cash"} aria-label="Mode of payment" className="col-span-2 md:col-span-1">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mini-lbl mr-1">Split:</span>
            {members.map((m) => (
              <button type="button" key={m.id} className="ptoggle inline-flex items-center gap-1" aria-pressed={!excluded.has(m.id)} onClick={() => toggle(m.id)}>
                {!excluded.has(m.id) && <Icon name="check" size={15} />}{m.name}
              </button>
            ))}
            <button type="button" className="btn-small" onClick={toggleAll}>All / none</button>
            {selected.map((m) => <input key={m.id} type="hidden" name="include" value={m.id} />)}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as SplitMode)} aria-label="How to split" className="!w-auto">
              <option value="equal">Equally</option>
              <option value="exact">Exact amounts</option>
              <option value="percent">Percentages</option>
              <option value="shares">Shares</option>
            </select>
            <div className="flex-1" />
            {editing && <Link href={`/groups/${groupId}`} className="btn-small btn-cancel">Cancel</Link>}
            <button className="btn" disabled={pending}>{pending ? "Saving…" : editing ? "Update Expense" : "Add Expense"}</button>
          </div>

          {mode !== "equal" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {selected.map((m) => (
                <label key={`${mode}-${m.id}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  <input name={`v_${m.id}`} inputMode="decimal" defaultValue={defaultValue(m.id)} placeholder={HINT[mode]}
                    className="!w-28 text-right" aria-label={`${m.name} (${HINT[mode]})`} />
                </label>
              ))}
            </div>
          )}
          <p className="err" role="alert">{state.error}</p>
        </form>
      )}
    </section>
  );
}

// ---------- individual spending ----------

type SpendExpense = { id: string; description: string; amountCents: number; paidBy: string; shares: Record<string, number> };

export function SpendingCard({ members, expenses, me }: { members: Member[]; expenses: SpendExpense[]; me: string }) {
  const [who, setWho] = useState(me);
  const name = members.find((m) => m.id === who)?.name ?? "?";
  const rows = expenses.filter((e) => e.paidBy === who || who in e.shares);
  const total = rows.reduce((a, e) => a + e.amountCents, 0);
  const share = rows.reduce((a, e) => a + (e.shares[who] ?? 0), 0);

  return (
    <section className="card">
      <h2>
        Individual Spending
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show spending for"
          className="!w-auto ml-auto !py-1 !text-xs no-print">
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </h2>
      {rows.length === 0 ? <p className="empty">{name} is not part of any expense yet.</p> : (
        <div className="overflow-x-auto"><table className="spend">
          <thead><tr><th>Event</th><th>Total</th><th>{name}&apos;s share</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.description}{e.paidBy === who && <span className="paidtag">paid</span>}</td>
                <td>{fmt(e.amountCents)}</td>
                <td>{e.shares[who] ? fmt(e.shares[who]) : <span className="zero">—</span>}</td>
              </tr>
            ))}
            <tr className="total"><td>Total</td><td>{fmt(total)}</td><td>{fmt(share)}</td></tr>
          </tbody>
        </table></div>
      )}
    </section>
  );
}
