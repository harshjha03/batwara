"use client";
// Render helpers below are invoked as functions, not mounted as <Components>, so no remount/focus loss.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveExpense, deleteExpense, settleUp, undoSettlement, addPerson, removePerson, claimMember,
  createGroup, renameGroup, leaveGroup, signOut,
} from "@/app/actions";
import { fmt, CURRENCY, splitAmount, toCents, type SplitMode } from "@/lib/money";
import { Icon, Avatar } from "@/components/icon";

export type AppMember = { id: string; userId: string | null; name: string; isMe: boolean };
export type AppExpense = { id: string; description: string; amountCents: number; paidBy: string; paymentMethod: string; shares: { memberId: string; cents: number }[] };
export type AppData = {
  me: string;
  group: { id: string; name: string; inviteCode: string };
  groups: { id: string; name: string; total: number }[];
  members: AppMember[];
  expenses: AppExpense[];
  settlements: { id: string; fromMember: string; toMember: string; amountCents: number }[];
  net: { memberId: string; cents: number }[];
  transfers: { from: string; to: string; cents: number }[];
  cards: { payer: string; total: number; ownShare: number; toCollect: number }[];
  total: number;
  myHistory: boolean;
  activity: { id: number; icon: string; tone: "mint" | "gold" | "neg"; text: string; time: string; amountCents: number | null }[];
};

type Tab = "balances" | "expenses" | "insights" | "people";
type Screen = "main" | "detail" | "activity" | "settings";
type Draft = { id?: string; desc: string; amount: string; payer: string; method: string; parts: Set<string>; mode: SplitMode; values: Record<string, string> };

const toneBg = { mint: "rgba(110,231,183,.12)", gold: "rgba(251,191,36,.12)", neg: "rgba(251,113,133,.12)" };
const toneBd = { mint: "var(--gbd)", gold: "rgba(251,191,36,.3)", neg: "rgba(251,113,133,.3)" };
const toneCl = { mint: "var(--mint)", gold: "var(--gold)", neg: "var(--neg)" };
const colorOf = (c: number) => (c > 0 ? "var(--pos)" : c < 0 ? "var(--neg)" : "var(--faint)");
const ringOf = (c: number) => (c > 0 ? "rgba(52,211,153,.5)" : c < 0 ? "rgba(251,113,133,.5)" : "var(--line)");
const tintOf = (c: number) => (c > 0 ? "var(--pos)" : c < 0 ? "var(--neg)" : "var(--mint)");

export function GroupApp({ data }: { data: AppData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("balances");
  const [screen, setScreen] = useState<Screen>("main");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [personInvite, setPersonInvite] = useState<string | null>(null);
  const [add, setAdd] = useState<{ editId?: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [spendPerson, setSpendPerson] = useState(data.me);
  const [newPerson, setNewPerson] = useState("");
  const [toast, setToast] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [busyState, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  // Buttons stay locked until the refreshed data is actually on screen, so a second tap can't act on stale state.
  const busy = busyState || pending;

  const flash = (m: string, ms = 1900) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), ms); };
  useEffect(() => () => clearTimeout(toastT.current), []);
  // Keep everyone's view fresh (polling, matches the previous behaviour).
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && navigator.onLine && router.refresh();
    const t = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);

  // Overlays: Escape closes, body scroll locks, focus moves in and is restored on close.
  const overlay = menuOpen || pickerOpen || inviteOpen || !!personInvite || !!add;
  useEffect(() => {
    if (!overlay) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false); setPickerOpen(false); setInviteOpen(false); setPersonInvite(null); setAdd(null); setDraft(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>("[role=dialog] input, [role=dialog] button, [role=menu] button, [role=listbox] button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [overlay]);

  const member = (id: string) => data.members.find((m) => m.id === id);
  const rawName = (id: string) => member(id)?.name ?? "someone";
  const nm = (id: string) => { const m = member(id); return m ? (m.isMe ? `${m.name} (you)` : m.name) : "?"; };
  const netMap = new Map(data.net.map((n) => [n.memberId, n.cents]));
  const fd = (o: Record<string, string | number | undefined>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v != null) f.set(k, String(v)); return f; };
  const gid = data.group.id;

  async function run(fn: () => Promise<{ error?: string } | void>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.error) { flash(r.error, 4500); startTransition(() => router.refresh()); return false; }
      startTransition(() => router.refresh());
      if (ok) flash(ok);
      return true;
    } catch (e) {
      const err = e as { digest?: string; message?: string };
      if (err.digest?.startsWith("NEXT_REDIRECT")) throw e; // let redirecting actions navigate
      // An installed PWA can outlive a deploy: the server no longer knows this action id. Reload to the new build.
      if (/server action/i.test(err.message ?? "")) { location.reload(); return false; }
      flash(typeof navigator !== "undefined" && !navigator.onLine ? "You're offline. Try again when you're back." : "Couldn't save that. Try again.", 4500);
      return false;
    } finally { setBusy(false); }
  }

  // ---- expense sheet ----
  function openAdd(editId?: string) {
    const e = editId ? data.expenses.find((x) => x.id === editId) : null;
    if (e) {
      const cents = e.shares.map((s) => s.cents);
      const even = cents.length > 0 && Math.max(...cents) - Math.min(...cents) <= 1;
      setDraft({ desc: e.description, amount: (e.amountCents / 100).toFixed(2), payer: e.paidBy, method: e.paymentMethod,
        parts: new Set(e.shares.map((s) => s.memberId)), mode: even ? "equal" : "exact",
        values: Object.fromEntries(e.shares.map((s) => [s.memberId, (s.cents / 100).toFixed(2)])) });
    } else {
      setDraft({ id: crypto.randomUUID(), desc: "", amount: "", payer: data.me, method: "cash", parts: new Set(data.members.map((m) => m.id)), mode: "equal", values: {} });
    }
    setAdd({ editId });
  }
  const setD = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const togglePart = (id: string) => setDraft((d) => { if (!d) return d; const parts = new Set(d.parts); if (parts.has(id)) parts.delete(id); else parts.add(id); return { ...d, parts }; });

  function previewShares(d: Draft) {
    const cents = toCents(d.amount);
    const ids = data.members.filter((m) => d.parts.has(m.id)).map((m) => m.id);
    const inputs = ids.map((id) => ({ memberId: id, value: d.mode === "exact" ? toCents(d.values[id]) : Number((d.values[id] ?? "").trim() || NaN) }));
    try { return { shares: splitAmount(cents, d.mode, inputs), error: "" }; } catch (e) { return { shares: null, error: (e as Error).message }; }
  }

  async function submitExpense() {
    if (!draft) return;
    const f = fd({ groupId: gid, expenseId: add?.editId, clientId: add?.editId ? undefined : draft.id, description: draft.desc, amount: draft.amount, paidBy: draft.payer, paymentMethod: draft.method, mode: draft.mode });
    data.members.filter((m) => draft.parts.has(m.id)).forEach((m) => { f.append("include", m.id); if (draft.mode !== "equal") f.set(`v_${m.id}`, draft.values[m.id] ?? ""); });
    const ok = await run(() => saveExpense({}, f), add?.editId ? "Expense updated" : "Expense added");
    if (ok) { setAdd(null); setDraft(null); if (screen === "detail") setScreen("main"); }
  }

  const go = (t: Tab) => { setTab(t); setScreen("main"); window.scrollTo({ top: 0 }); };
  const openDetail = (id: string) => { setDetailId(id); setScreen("detail"); window.scrollTo({ top: 0 }); };
  const tabTitle = { balances: "Balances", expenses: "Expenses", insights: "Insights", people: "People" }[tab];

  // ---------- render ----------
  return (
    <div style={{ minHeight: "100dvh" }}>
      <div className="orb a" /><div className="orb b" />
      <div className="relative mx-auto w-full" style={{ maxWidth: "var(--app)", zIndex: 1 }}>

        {screen === "main" && (
          <main className="px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)", paddingBottom: "120px" }}>
            {/* top bar */}
            <div className="flex items-center justify-between pb-3">
              <span className="brand" style={{ fontSize: 24 }}>Batwara</span>
              <div className="flex items-center gap-2">
                <button className="pill pill-mint" onClick={() => setInviteOpen(true)}><Icon name="link" size={14} /> Invite</button>
                <button className="pill !px-0 !w-[34px] justify-center" aria-label="Menu" onClick={() => setMenuOpen(true)}><Icon name="more" size={18} /></button>
              </div>
            </div>

            {/* group picker */}
            <button className="w-full mb-3.5 flex items-center justify-between rounded-[14px] px-4 py-2.5" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--line)" }} onClick={() => setPickerOpen(true)}>
              <span className="flex flex-col items-start"><span className="eyebrow !text-[10px]" style={{ color: "var(--faint)" }}>Group</span><span className="serif font-bold text-[17px] text-white">{data.group.name}</span></span>
              <span className="flex items-center gap-2.5"><span className="text-[11px] font-semibold gold">{fmt(data.total)} total</span><Icon name="chevron-down" size={18} className="muted" /></span>
            </button>

            <h1 className="serif font-bold text-[22px] text-white mx-0.5 mt-1 mb-3.5">{tabTitle}</h1>

            {tab === "balances" && Balances()}
            {tab === "expenses" && Expenses()}
            {tab === "insights" && Insights()}
            {tab === "people" && People()}
          </main>
        )}

        {screen === "detail" && Detail()}
        {screen === "activity" && Activity()}
        {screen === "settings" && Settings()}
      </div>

      {/* FAB + nav (main only) */}
      {screen === "main" && (
        <>
          <button className="fab no-print" aria-label="Add expense" onClick={() => openAdd()}><Icon name="add" size={26} strokeWidth={2.2} /></button>
          <div className="navwrap no-print"><div className="nav">
            {NavBtn({ t: "balances", icon: "scale", label: "Balances" })}
            {NavBtn({ t: "expenses", icon: "receipt", label: "Expenses" })}
            {NavBtn({ t: "insights", icon: "chart", label: "Insights" })}
            {NavBtn({ t: "people", icon: "people", label: "People" })}
          </div></div>
        </>
      )}

      {menuOpen && Menu()}
      {pickerOpen && Picker()}
      {inviteOpen && Invite()}
      {personInvite && PersonInvite()}
      {add && draft && AddSheet()}
      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={15} className="pos" strokeWidth={2.4} />{toast}</div>}
    </div>
  );

  function NavBtn({ t, icon, label }: { t: Tab; icon: string; label: string }) {
    return <button className="nav-btn" aria-current={tab === t && screen === "main" ? "page" : undefined} onClick={() => go(t)}><Icon name={icon} size={23} strokeWidth={1.8} /><span>{label}</span></button>;
  }

  // ---- Balances ----
  function Balances() {
    const transfers = data.transfers;
    return (
      <>
        <div className="card mb-3.5">
          <div className="flex items-center justify-between mb-3.5"><h2 className="card-title">Who pays whom</h2><span className="text-[11px] faint">{transfers.length} {transfers.length === 1 ? "payment" : "payments"}</span></div>
          {data.expenses.length === 0 ? <p className="faint py-1.5 text-sm">Add an expense to see the plan.</p>
            : transfers.length === 0 ? (
              <div className="rounded-[14px] p-[18px] text-center" style={{ background: "linear-gradient(150deg,rgba(52,211,153,.14),rgba(52,211,153,.05))", border: "1px solid rgba(52,211,153,.3)" }}>
                <Icon name="check" size={30} className="pos" strokeWidth={2.2} />
                <div className="mt-2 text-[15px] font-semibold pos">All settled up</div>
                <div className="text-xs muted mt-0.5">Nobody owes anybody. Nicely done.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {transfers.map((t) => (
                  <div key={`${t.from}-${t.to}`} className="rounded-[13px] p-3" style={{ background: "linear-gradient(135deg,rgba(251,191,36,.08),rgba(16,185,129,.08))", border: "1px solid rgba(251,191,36,.18)" }}>
                    <div className="flex items-center gap-2.5 text-[13.5px]">
                      <Avatar name={rawName(t.from)} size={28} ring="var(--neg)" tint="#fda4b0" />
                      <span className="font-semibold text-white truncate">{nm(t.from)}</span>
                      <Icon name="arrow" size={16} className="gold shrink-0" />
                      <span className="font-semibold text-white truncate">{nm(t.to)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="serif text-[17px] font-semibold gold tnum">{fmt(t.cents)}</span>
                      <button className="pill pill-pos" disabled={busy} onClick={() => run(() => settleUp(fd({ groupId: gid, from: t.from, to: t.to, cents: t.cents })), "Payment recorded")}><Icon name="check" size={13} strokeWidth={2.4} /> Settle up</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          {data.settlements.length > 0 && (
            <div className="mt-3.5 pt-3.5" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="eyebrow mb-2">Recorded payments</div>
              {data.settlements.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 text-[13px]">
                  <span className="muted">{nm(s.fromMember)} → {nm(s.toMember)}</span>
                  <span className="flex items-center gap-2.5"><span className="font-semibold tnum" style={{ color: "var(--gold-soft)" }}>{fmt(s.amountCents)}</span><button className="faint text-xs underline" disabled={busy} onClick={() => run(() => undoSettlement(fd({ groupId: gid, id: s.id })), "Payment removed")}>undo</button></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card mb-3.5">
          <h2 className="card-title mb-3.5">Net balances</h2>
          {data.expenses.length === 0 ? <p className="faint py-1.5 text-sm">Add people and expenses to see balances.</p> : data.members.map((m) => {
            const c = netMap.get(m.id) ?? 0;
            return (
              <div key={m.id} className="row">
                <Avatar name={m.name} ring={ringOf(c)} tint={tintOf(c)} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-white flex items-center gap-1.5">{m.name}{m.isMe && <span className="you">YOU</span>}</div>
                  <div className="text-xs muted mt-px">{c > 0 ? "gets back" : c < 0 ? "owes" : "settled up"}</div>
                </div>
                <span className="text-[16px] font-semibold tnum" style={{ color: colorOf(c), textShadow: c !== 0 ? `0 0 12px ${c > 0 ? "rgba(52,211,153,.35)" : "rgba(251,113,133,.3)"}` : "none" }}>{c === 0 ? "—" : fmt(c)}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ---- Expenses ----
  function Expenses() {
    return (
      <div className="card mb-3.5">
        <div className="flex items-center justify-between mb-3"><h2 className="card-title">Expenses</h2><span className="count">{data.expenses.length}</span></div>
        {data.expenses.length === 0 ? <p className="faint py-1.5 text-sm">No expenses yet. Tap + to add one.</p> : data.expenses.map((e) => {
          const ids = e.shares.map((s) => s.memberId);
          const cents = e.shares.map((s) => s.cents);
          const even = cents.length > 0 && Math.max(...cents) - Math.min(...cents) <= 1;
          const names = ids.map((i) => rawName(i)).join(", ");
          const among = even && ids.length === data.members.length ? "Split evenly" : even ? `Split evenly between ${names}` : `Split unevenly between ${names}`;
          return (
            <button key={e.id} className="row w-full text-left" onClick={() => openDetail(e.id)}>
              <Avatar name={rawName(e.paidBy)} size={38} className="!rounded-[11px]" ring="var(--line)" />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold text-white truncate">{e.description}</div>
                <div className="text-[11.5px] muted mt-0.5 flex items-center gap-1.5"><span className="truncate">{rawName(e.paidBy)} paid · {among}</span><span className="tag shrink-0">{e.paymentMethod}</span></div>
              </div>
              <span className="text-[15px] font-semibold gold tnum">{fmt(e.amountCents)}</span>
              <Icon name="chevron-right" size={16} className="faint" />
            </button>
          );
        })}
        {data.total > 0 && <p className="muted text-xs mt-2.5">Total spent · {fmt(data.total)}</p>}
      </div>
    );
  }

  // ---- Insights (spending + card payments) ----
  function Insights() {
    const rows = data.expenses.filter((e) => e.paidBy === spendPerson || e.shares.some((s) => s.memberId === spendPerson))
      .map((e) => ({ id: e.id, desc: e.description, total: e.amountCents, share: e.shares.find((s) => s.memberId === spendPerson)?.cents ?? 0 }));
    const shareTotal = rows.reduce((a, r) => a + r.share, 0);
    const cardTotal = data.cards.reduce((a, c) => a + c.total, 0);
    const own = data.cards.reduce((a, c) => a + c.ownShare, 0);
    const collect = data.cards.reduce((a, c) => a + c.toCollect, 0);
    const SHARE = "#fcd34d", COLLECT = "#34d399", GAP = "#06251c";
    const deg = cardTotal ? (own / cardTotal) * 360 : 0;
    const donut = own === 0 ? COLLECT : collect === 0 ? SHARE
      : `conic-gradient(${SHARE} 1.6deg ${deg - 1.6}deg,${GAP} ${deg - 1.6}deg ${deg + 1.6}deg,${COLLECT} ${deg + 1.6}deg 358.4deg,${GAP} 358.4deg 360deg)`;
    return (
      <>
        <div className="card mb-3.5">
          <h2 className="card-title mb-3.5">Individual spending</h2>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {data.members.map((m) => (
              <button key={m.id} onClick={() => setSpendPerson(m.id)} aria-pressed={spendPerson === m.id} className="h-8 px-3 rounded-full text-[12.5px] font-semibold"
                style={spendPerson === m.id ? { background: "rgba(251,191,36,.14)", border: "1px solid rgba(251,191,36,.3)", color: "var(--gold)" } : { background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--muted)" }}>{m.isMe ? "You" : m.name}</button>
            ))}
          </div>
          {rows.length === 0 ? <p className="faint py-1 text-sm">Not part of any expense yet.</p> : (
            <table className="w-full border-collapse text-[13px]">
              <thead><tr><th className="text-left pb-2.5 eyebrow !text-[10px] faint font-bold">Event</th><th className="text-right pb-2.5 eyebrow !text-[10px] faint font-bold">Total</th><th className="text-right pb-2.5 eyebrow !text-[10px] faint font-bold">Their share</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><td className="py-2 text-white" style={{ borderTop: "1px solid var(--line)" }}>{r.desc}</td><td className="py-2 text-right muted tnum" style={{ borderTop: "1px solid var(--line)" }}>{fmt(r.total)}</td><td className="py-2 text-right gold font-semibold tnum" style={{ borderTop: "1px solid var(--line)" }}>{r.share ? fmt(r.share) : "—"}</td></tr>
                ))}
                <tr><td className="pt-2.5 font-bold text-white" style={{ borderTop: "1.5px solid var(--gbd)" }}>Total</td><td style={{ borderTop: "1.5px solid var(--gbd)" }} /><td className="pt-2.5 text-right font-bold gold tnum" style={{ borderTop: "1.5px solid var(--gbd)" }}>{fmt(shareTotal)}</td></tr>
              </tbody>
            </table>
          )}
        </div>

        {data.cards.length > 0 && (
          <div className="card mb-3.5">
            <h2 className="card-title mb-1">Card payments</h2>
            <div className="text-xs muted mb-4">Of {fmt(cardTotal)} paid by card</div>
            <div className="flex items-center gap-5">
              <div className="donut" style={{ background: donut }}><div className="hole"><div className="display text-[24px] gold">{cardTotal ? Math.round((own / cardTotal) * 100) : 0}%</div><div className="text-[9.5px] uppercase muted tracking-wide">own share</div></div></div>
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <div><div className="flex items-center gap-1.5 text-xs muted"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SHARE }} />Their share</div><div className="text-[15px] font-semibold text-white tnum mt-0.5 pl-4">{fmt(own)}</div></div>
                <div><div className="flex items-center gap-1.5 text-xs muted"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLLECT }} />To collect</div><div className="text-[15px] font-semibold text-white tnum mt-0.5 pl-4">{fmt(collect)}</div></div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ---- People ----
  function People() {
    const ghosts = data.members.filter((m) => !m.userId);
    const canClaim = !data.myHistory && ghosts.length > 0;
    return (
      <div className="card mb-3.5">
        <div className="flex items-center justify-between mb-1.5"><h2 className="card-title">People</h2><span className="count">{data.members.length}</span></div>
        {data.members.map((m) => (
          <div key={m.id} className="row">
            <Avatar name={m.name} size={36} ring={m.isMe ? "var(--gold)" : m.userId ? "var(--gbd)" : "var(--line)"} tint={m.isMe ? "var(--gold)" : m.userId ? "var(--mint)" : "var(--faint)"} />
            <span className="flex-1 min-w-0 text-[14.5px] font-medium text-white truncate">{m.name}</span>
            <span className="text-[12px] font-semibold" style={{ color: m.isMe ? "var(--gold)" : m.userId ? "var(--mint)" : "var(--muted)" }}>{m.isMe ? "You" : m.userId ? "Joined" : "Not joined"}</span>
            {!m.userId && canClaim && <button className="pill pill-gold !h-[30px]" disabled={busy} onClick={() => run(() => claimMember({}, fd({ groupId: gid, memberId: m.id })), "That's you now")}>This is me</button>}
            {!m.userId && <button className="flex-none w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "rgba(110,231,183,.1)", border: "1px solid var(--gbd)", color: "var(--mint)" }} aria-label={`Invite ${m.name}`} onClick={() => setPersonInvite(m.id)}><Icon name="link" size={15} /></button>}
          </div>
        ))}
        <form className="flex gap-2.5 mt-3.5" action={() => { if (newPerson.trim()) run(() => addPerson({}, fd({ groupId: gid, name: newPerson })), "Added").then((ok) => ok && setNewPerson("")); }}>
          <input className="inp !h-[42px]" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Add a name…" aria-label="New person" />
          <button type="submit" className="w-[42px] h-[42px] flex-none flex items-center justify-center rounded-xl" style={{ background: "rgba(110,231,183,.1)", border: "1px solid var(--gbd)", color: "var(--mint)" }} aria-label="Add" disabled={busy}><Icon name="add" size={20} /></button>
        </form>
      </div>
    );
  }

  // ---- Expense detail ----
  function Detail() {
    const e = data.expenses.find((x) => x.id === detailId);
    if (!e) return (
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}>
        <button className="flex items-center gap-1 mint text-sm py-1.5" onClick={() => setScreen("main")}><Icon name="back" size={18} /> Back</button>
        <p className="faint mt-6">That expense is no longer here.</p>
      </div>
    );
    const ids = e.shares.map((s) => s.memberId);
    const cents = e.shares.map((s) => s.cents);
    const even = cents.length > 0 && Math.max(...cents) - Math.min(...cents) <= 1;
    const meta = `${rawName(e.paidBy)} paid · ${e.paymentMethod} · ${even ? "split evenly" : "split unevenly"} · ${ids.length === data.members.length ? "everyone" : `${ids.length} people`}`;
    return (
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)", paddingBottom: "40px" }}>
        <button className="flex items-center gap-1 mint text-sm py-1.5 mb-2.5" onClick={() => setScreen("main")}><Icon name="back" size={18} /> Expenses</button>
        <div className="text-center py-3.5 pb-6">
          <div className="text-[13px] muted">{e.description}</div>
          <div className="display text-[46px] gold mt-1.5 tnum" style={{ textShadow: "0 0 24px rgba(251,191,36,.22)" }}>{fmt(e.amountCents)}</div>
          <div className="text-[12.5px] muted mt-2">{meta}</div>
        </div>
        <div className="card mb-3.5">
          <div className="eyebrow mb-3">Split breakdown</div>
          {e.shares.map((s) => (
            <div key={s.memberId} className="row !py-2.5">
              <Avatar name={rawName(s.memberId)} size={32} ring="var(--line)" />
              <span className="flex-1 text-sm text-white">{nm(s.memberId)}</span>
              <span className="text-sm font-semibold text-white tnum">{fmt(s.cents)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-[13px] gold font-semibold text-sm" style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.28)" }} onClick={() => openAdd(e.id)}><Icon name="edit" size={16} /> Edit</button>
          <button className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-[13px] neg font-semibold text-sm" style={{ background: "rgba(251,113,133,.08)", border: "1px solid rgba(251,113,133,.25)" }} disabled={busy} onClick={() => run(() => deleteExpense(fd({ groupId: gid, id: e.id })), "Expense deleted").then((ok) => ok && setScreen("main"))}><Icon name="delete" size={16} /> Delete</button>
        </div>
      </div>
    );
  }

  // ---- Activity ----
  function Activity() {
    return (
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)", paddingBottom: "40px" }}>
        <button className="flex items-center gap-1 mint text-sm py-1.5 mb-3" onClick={() => setScreen("main")}><Icon name="back" size={18} /> Back</button>
        <h1 className="serif font-bold text-[26px] text-white mb-4.5">Activity</h1>
        {data.activity.length === 0 ? <p className="faint text-sm">Nothing has happened yet.</p> : (
          <div className="flex flex-col gap-2.5">
            {data.activity.map((a) => (
              <div key={a.id} className="flex gap-3 items-start">
                <div className="flex-none w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: toneBg[a.tone], border: `1px solid ${toneBd[a.tone]}`, color: toneCl[a.tone] }}><Icon name={a.icon} size={18} /></div>
                <div className="flex-1 min-w-0 pb-3" style={{ borderBottom: "1px solid var(--line)" }}><div className="text-[13.5px] text-white leading-snug">{a.text}</div><div className="text-[11.5px] faint mt-0.5">{a.time}</div></div>
                {a.amountCents != null && <span className="text-[13.5px] font-semibold tnum gold">{fmt(a.amountCents)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Settings ----
  function Settings() {
    return (
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)", paddingBottom: "40px" }}>
        <button className="flex items-center gap-1 mint text-sm py-1.5 mb-3" onClick={() => setScreen("main")}><Icon name="back" size={18} /> Back</button>
        <h1 className="serif font-bold text-[26px] text-white mb-4.5">Group settings</h1>
        <div className="card mb-3.5">
          <div className="eyebrow mb-2">Group name</div>
          <input className="inp !h-12" defaultValue={data.group.name} onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== data.group.name) run(() => renameGroup(fd({ groupId: gid, name })), "Renamed"); }} />
          <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}><div><div className="text-sm text-white font-semibold">Currency</div><div className="text-xs muted">Indian Rupee · en-IN</div></div><span className="display text-[24px] gold">{CURRENCY}</span></div>
        </div>
        <div className="card mb-3.5">
          <div className="eyebrow mb-3">Members · {data.members.length}</div>
          {data.members.map((m) => (
            <div key={m.id} className="row !py-2.5">
              <Avatar name={m.name} size={34} ring="var(--line)" />
              <div className="flex-1"><span className="text-sm text-white font-medium">{m.name}</span> <span className="text-[11px]" style={{ color: m.userId ? "var(--mint)" : "var(--faint)" }}>{m.userId ? "joined" : "guest"}</span></div>
              {!m.userId && !data.expenses.some((e) => e.paidBy === m.id || e.shares.some((s) => s.memberId === m.id)) && <button className="iconbtn" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => run(() => removePerson({}, fd({ groupId: gid, memberId: m.id })), "Removed")}><Icon name="close" size={16} /></button>}
            </div>
          ))}
        </div>
        <button className="w-full h-12 rounded-[13px] neg font-semibold text-sm" style={{ background: "rgba(251,113,133,.08)", border: "1px solid rgba(251,113,133,.25)" }} disabled={busy} onClick={() => { if (confirm("Leave this group? Your expense history stays under your name.")) run(() => leaveGroup(fd({ groupId: gid }))); }}>Leave group</button>
      </div>
    );
  }

  // ---- overlays ----
  function Menu() {
    const items = [
      { icon: "history", label: "Activity", on: () => { setMenuOpen(false); setScreen("activity"); window.scrollTo({ top: 0 }); } },
      { icon: "settings", label: "Group settings", on: () => { setMenuOpen(false); setScreen("settings"); window.scrollTo({ top: 0 }); } },
      { icon: "person-add", label: "New group", on: () => { setMenuOpen(false); const n = prompt("Group name?")?.trim(); if (n) run(() => createGroup(fd({ name: n }))); } },
      { icon: "logout", label: "Sign out", on: () => run(() => signOut()) },
    ];
    return (
      <>
        <div className="backdrop soft no-print" onClick={() => setMenuOpen(false)} />
        <div className="menu no-print" role="menu" aria-label="More" style={{ top: 64, right: 16 }}>
          {items.map((i) => <button key={i.label} className="menu-item" onClick={i.on}><Icon name={i.icon} size={18} className="muted" />{i.label}</button>)}
        </div>
      </>
    );
  }

  function Picker() {
    return (
      <>
        <div className="backdrop soft no-print" onClick={() => setPickerOpen(false)} />
        <div className="menu no-print" role="listbox" aria-label="Switch group" style={{ top: 120, left: 16, right: 16, width: "auto", maxWidth: "calc(var(--app) - 32px)", margin: "0 auto" }}>
          {data.groups.map((g) => (
            <button key={g.id} className="w-full flex items-center justify-between px-4 py-3.5 text-left" style={{ background: g.id === gid ? "rgba(110,231,183,.08)" : "none", borderBottom: "1px solid rgba(255,255,255,.05)" }} onClick={() => { setPickerOpen(false); if (g.id !== gid) router.push(`/groups/${g.id}`); }}>
              <span className="serif font-bold text-[15px] text-white">{g.name}</span><span className="text-[11px] muted">{fmt(g.total)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  function Invite() {
    const link = typeof window !== "undefined" ? `${location.origin}/join/${data.group.inviteCode}` : "";
    const copy = async () => { try { await navigator.clipboard.writeText(link); flash("Invite link copied"); } catch { prompt("Copy this link:", link); } };
    return (
      <>
        <div className="backdrop no-print" onClick={() => setInviteOpen(false)} />
        <div className="sheet no-print" role="dialog" aria-modal="true" aria-label="Invite to group">
          <div className="grab" />
          <div className="flex items-start justify-between mb-1.5"><div><div className="eyebrow">Invite to</div><h2 className="serif font-bold text-[22px] text-white mt-0.5">{data.group.name}</h2></div><button className="iconbtn" onClick={() => setInviteOpen(false)}><Icon name="close" size={22} /></button></div>
          <div className="text-[13px] muted leading-normal mb-4.5">Anyone with this link can join and start adding expenses.</div>
          <div className="rounded-2xl p-4.5 text-center mb-3.5" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--gbd)" }}>
            <div className="eyebrow !text-faint mb-2">Group code</div>
            <div className="display text-[30px] gold break-all" style={{ textShadow: "0 0 20px rgba(251,191,36,.25)" }}>{data.group.inviteCode}</div>
          </div>
          <button className="btn w-full !h-[52px]" onClick={copy}><Icon name="copy" size={17} /> Copy link</button>
          <div className="text-[11.5px] faint text-center mt-3.5">{data.members.length} people in this group</div>
        </div>
      </>
    );
  }

  /** Personal invite for a guest: the disclaimer + a link that joins the opener *as* that person. */
  function PersonInvite() {
    const m = member(personInvite!);
    if (!m) return null;
    const link = typeof window !== "undefined" ? `${location.origin}/join/${data.group.inviteCode}?as=${m.id}` : "";
    const close = () => setPersonInvite(null);
    const copy = async () => { try { await navigator.clipboard.writeText(link); flash("Invite link copied"); } catch { prompt("Copy this link:", link); } };
    return (
      <>
        <div className="backdrop no-print" onClick={close} />
        <div className="sheet no-print" role="dialog" aria-modal="true" aria-label={`Invite as ${m.name}`}>
          <div className="grab" />
          <div className="flex items-start justify-between mb-1.5"><div><div className="eyebrow">Invite as</div><h2 className="serif font-bold text-[22px] text-white mt-0.5">{m.name}</h2></div><button className="iconbtn" aria-label="Close" onClick={close}><Icon name="close" size={22} /></button></div>
          <p className="text-[13px] muted leading-relaxed mb-4">Send this to <span className="text-white">{m.name}</span>. Whoever opens it joins as <span className="text-white">{m.name}</span> — all of their expenses and balance become theirs once they confirm. This can&apos;t be undone.</p>
          <div className="rounded-2xl p-4 mb-3.5" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--gbd)" }}>
            <div className="eyebrow !text-faint mb-1.5">Personal invite link</div>
            <div className="text-[13px] mint break-all font-medium">{link}</div>
          </div>
          <button className="btn w-full !h-[52px]" onClick={copy}><Icon name="copy" size={17} /> Copy invite link</button>
          <button className="w-full h-11 mt-2.5 mint text-[13px] font-semibold inline-flex items-center justify-center gap-1" onClick={() => router.push(`/join/${data.group.inviteCode}?as=${m.id}&preview=1`)}>Preview what they&apos;ll see <Icon name="arrow" size={14} /></button>
        </div>
      </>
    );
  }

  function AddSheet() {
    const d = draft!;
    const parts = data.members.filter((m) => d.parts.has(m.id));
    const pv = previewShares(d);
    const modeLabels: [SplitMode, string][] = [["equal", "Equally"], ["exact", "Exact"], ["percent", "%"], ["shares", "Shares"]];
    return (
      <>
        <div className="backdrop no-print" onClick={() => { setAdd(null); setDraft(null); }} />
        <div className="sheet no-print scrl" role="dialog" aria-modal="true" aria-label={add?.editId ? "Edit expense" : "Add expense"}>
          <div className="grab" />
          <div className="flex items-center justify-between mb-4.5"><h2 className="serif font-bold text-[22px] text-white">{add?.editId ? "Edit expense" : "Add expense"}</h2><button className="iconbtn" onClick={() => { setAdd(null); setDraft(null); }}><Icon name="close" size={22} /></button></div>

          <div className="eyebrow mb-1.5">What was it for</div>
          <input className="inp mb-4" value={d.desc} onChange={(e) => setD({ desc: e.target.value })} placeholder="Dinner, cab, groceries…" />

          <div className="eyebrow mb-1.5">Amount</div>
          <div className="flex items-center h-[60px] px-4 mb-4 rounded-[13px]" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)" }}>
            <span className="display text-[28px] gold mr-2">{CURRENCY}</span>
            <input className="flex-1 min-w-0 bg-transparent border-0 text-white text-[28px] font-semibold outline-none tnum" value={d.amount} onChange={(e) => setD({ amount: e.target.value })} placeholder="0" inputMode="decimal" aria-label="Amount" />
          </div>

          <div className="eyebrow mb-1.5">Paid by</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 scrl">
            {data.members.map((m) => (
              <button key={m.id} onClick={() => setD({ payer: m.id })} aria-pressed={d.payer === m.id} className="flex-none flex items-center gap-1.5 h-[38px] pl-2 pr-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap"
                style={d.payer === m.id ? { background: "rgba(251,191,36,.14)", border: "1px solid rgba(251,191,36,.3)", color: "var(--gold)" } : { background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                <Avatar name={m.name} size={24} ring="transparent" tint={d.payer === m.id ? "var(--gold)" : "var(--mint)"} />{m.isMe ? "You" : m.name}
              </button>
            ))}
          </div>

          <div className="eyebrow mb-1.5">Method</div>
          <div className="flex gap-2.5 mb-4">
            {(["cash", "card"] as const).map((mth) => (
              <button key={mth} onClick={() => setD({ method: mth })} aria-pressed={d.method === mth} className="flex-1 h-11 rounded-xl text-[13.5px] font-semibold capitalize"
                style={d.method === mth ? { background: "rgba(110,231,183,.14)", border: "1px solid var(--gbd)", color: "var(--mint)" } : { background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--muted)" }}>{mth}</button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-1.5"><div className="eyebrow">Split between · {parts.length}</div><button className="text-[11.5px] font-semibold mint" onClick={() => setD({ parts: parts.length === data.members.length ? new Set() : new Set(data.members.map((m) => m.id)) })}>{parts.length === data.members.length ? "Clear all" : "Select all"}</button></div>
          <div className="scrl max-h-56 overflow-y-auto rounded-[14px] mb-4" style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}>
            {data.members.map((m) => {
              const on = d.parts.has(m.id);
              return (
                <button key={m.id} onClick={() => togglePart(m.id)} role="checkbox" aria-checked={on} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left" style={{ borderBottom: "1px solid var(--line)" }}>
                  <Avatar name={m.name} size={30} ring="transparent" />
                  <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: on ? "#fff" : "var(--faint)" }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
                  <span className="flex-none w-6 h-6 rounded-full flex items-center justify-center" style={{ background: on ? "var(--mint)" : "transparent", border: `1.5px solid ${on ? "var(--mint)" : "var(--line)"}` }}>{on && <Icon name="check" size={13} strokeWidth={3} className="text-[#06251c]" />}</span>
                </button>
              );
            })}
          </div>

          <div className="eyebrow mb-1.5">How to split</div>
          <div className="seg mb-3.5">
            {modeLabels.map(([m, label]) => <button key={m} aria-pressed={d.mode === m} onClick={() => setD({ mode: m })}>{label}</button>)}
          </div>

          {d.mode !== "equal" && (
            <div className="rounded-[14px] p-3.5 mb-3.5" style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}>
              {parts.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-1.5">
                  <span className="flex-1 text-[13.5px] text-white truncate">{m.isMe ? `${m.name} (you)` : m.name}</span>
                  <div className="flex items-center gap-1.5 w-[120px]">
                    {d.mode === "exact" && <span className="text-[13px] muted">{CURRENCY}</span>}
                    <input className="flex-1 min-w-0 h-[38px] px-2.5 rounded-[10px] text-white text-[16px] outline-none text-right tnum" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)" }} value={d.values[m.id] ?? ""} onChange={(e) => setD({ values: { ...d.values, [m.id]: e.target.value } })} inputMode="decimal" placeholder="0" aria-label={`${m.name} value`} />
                    {d.mode === "percent" && <span className="text-[13px] muted">%</span>}
                    {d.mode === "shares" && <span className="text-[13px] muted">×</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-3.5 py-3 mb-4 rounded-[13px]" style={{ background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.18)" }}>
            <span className="text-[12.5px] muted">{pv.error ? "Check the split" : "Splits add up"}</span>
            <span className="text-[13px] font-semibold" style={{ color: pv.error ? "var(--neg)" : "var(--pos)" }}>{pv.error || "✓"}</span>
          </div>

          <button className="btn w-full !h-[54px]" disabled={busy} onClick={submitExpense}>{add?.editId ? "Save changes" : "Add expense"}</button>
        </div>
      </>
    );
  }
}
