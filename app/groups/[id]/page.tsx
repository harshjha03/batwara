import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, groupMembers } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { deleteExpense, settleUp, undoSettlement, signOut, type Action } from "@/app/actions";
import { balances, simplifyDebts, cardSummary, fmt, type Expense, type Split, type Settlement } from "@/lib/money";
import { Icon } from "@/components/icon";
import {
  AutoRefresh, ExpenseForm, GroupSwitcher, InviteButton, Menu, NewGroupButton, PeopleCard, PrintButton, SpendingCard,
  TabShell, type EditingExpense,
} from "./client";

// Per-user page: blocks on the server, nothing to prerender.
export const instant = false;

type Row = Expense & { description: string; paymentMethod: string; createdAt: Date };
type ActivityDetails = { description?: string; amountCents?: number; fromName?: string; toName?: string; name?: string };
type ActivityRow = { id: number; actorId: string | null; actorName: string | null; action: Action; details: ActivityDetails; createdAt: Date };

export default async function GroupPage({ params, searchParams }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const { edit } = await searchParams;
  const me = await requireUser();
  const roster = await groupMembers(id);
  const mine = roster.find((m) => m.userId === me);
  if (!mine) notFound();
  // Mark yourself everywhere, so two people with the same name stay tell-apart-able.
  const members = roster.map((m) => (m.id === mine.id ? { ...m, name: `${m.name} (you)` } : m));

  const [groups, expenses, splits, settlements, activity] = await Promise.all([
    sql<{ id: string; name: string; inviteCode: string }[]>`
      select g.id, g.name, g.invite_code from groups g join group_members m on m.group_id = g.id and m.user_id = ${me}
      order by g.created_at`,
    sql<Row[]>`
      select id, description, amount_cents, paid_by, payment_method, created_at from expenses
      where group_id = ${id} and deleted_at is null order by created_at`,
    sql<Split[]>`
      select s.expense_id, s.member_id, s.share_cents from expense_splits s join expenses e on e.id = s.expense_id
      where e.group_id = ${id} and e.deleted_at is null`,
    sql<(Settlement & { id: string })[]>`
      select id, from_member, to_member, amount_cents from settlements where group_id = ${id} order by created_at`,
    sql<ActivityRow[]>`
      select a.id, a.actor_id, a.action, a.details, a.created_at, p.name as actor_name
      from activity a left join profiles p on p.id = a.actor_id
      where a.group_id = ${id} order by a.created_at desc limit 100`,
  ]);
  const group = groups.find((g) => g.id === id)!;

  const name = (mid: string) => members.find((m) => m.id === mid)?.name ?? "?";
  const sharesOf = new Map<string, Record<string, number>>();
  for (const s of splits) (sharesOf.get(s.expenseId) ?? sharesOf.set(s.expenseId, {}).get(s.expenseId)!)[s.memberId] = s.shareCents;
  const withShares = expenses.map((e) => ({ ...e, shares: sharesOf.get(e.id) ?? {} }));

  const net = balances(expenses, splits, settlements);
  const transfers = simplifyDebts(net);
  const total = expenses.reduce((a, e) => a + e.amountCents, 0);
  const cards = cardSummary(expenses, splits);
  const myHistory = expenses.some((e) => e.paidBy === mine.id) || splits.some((s) => s.memberId === mine.id)
    || settlements.some((s) => s.fromMember === mine.id || s.toMember === mine.id);

  const editRow = typeof edit === "string" ? withShares.find((e) => e.id === edit) : undefined;
  const editing: EditingExpense | undefined = editRow && {
    id: editRow.id, description: editRow.description, amountCents: editRow.amountCents,
    paidBy: editRow.paidBy, paymentMethod: editRow.paymentMethod, shares: editRow.shares,
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-3 pb-28 md:pb-6 flex flex-col gap-3">
      <header className="relative z-40 flex items-center gap-2">
        <Link href="/" className="brand shrink-0">Batwara</Link>
        <div className="flex-1 min-w-0 no-print"><GroupSwitcher groups={groups} current={id} /></div>
        <h1 className="print-only text-lg font-bold">{group.name}</h1>
        <div className="no-print shrink-0"><InviteButton code={group.inviteCode} /></div>
        <Menu>
          <NewGroupButton />
          <PrintButton />
          <form action={signOut}><button className="menu-item">Sign out</button></form>
        </Menu>
      </header>
      <p className="print-only">
        {group.name} · Batwara report · {new Date().toLocaleString("en-IN")} · {members.length} people · {expenses.length} expenses · total {fmt(total)}
      </p>
      <AutoRefresh />

      {/* Phones: TabShell shows one data-sec group at a time via the bottom bar.
          Desktop (md+): the `contents` wrappers become the dashboard grid and everything shows. */}
      <TabShell>
        <div className="flex flex-col gap-3">
          <div className="contents md:grid md:grid-cols-[1fr_2fr] md:gap-3 md:items-start">
            <div data-sec="group" className="contents"><PeopleCard groupId={id} members={members} canClaim={!myHistory} /></div>
            <div data-sec="add" className="contents">
              <ExpenseForm key={editing?.id ?? "new"} groupId={id} members={members} me={mine.id} editing={editing} />
            </div>
          </div>

          <div className="contents md:grid md:grid-cols-2 md:gap-3 md:items-start">
            <div className="contents md:flex md:flex-col md:gap-3">
              <div data-sec="expenses" className="contents">
                <section className="card">
                  <h2>Expenses <span className="badge">{expenses.length}</span></h2>
                  {expenses.length === 0 ? <p className="empty">No expenses yet.</p> : withShares.map((e) => {
                    const parts = Object.keys(e.shares);
                    const even = Math.max(...Object.values(e.shares)) - Math.min(...Object.values(e.shares)) <= 1;
                    const among = parts.length === members.length ? "among everyone" : `between ${parts.map(name).join(", ")}`;
                    return (
                      <div key={e.id} className="list-row">
                        <div className="min-w-0">
                          <p className="font-semibold text-white">{e.description}</p>
                          <p className="muted text-xs mt-0.5 inline-flex flex-wrap items-center gap-x-1">
                            <span>Paid by <b>{name(e.paidBy)}</b></span>
                            <Icon name={e.paymentMethod === "card" ? "credit_card" : "payments"} size={15} />
                            <span>· split {among}{even ? ` (${fmt(Math.round(e.amountCents / parts.length))} each)` : " (unequal)"}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end shrink-0 md:flex-row md:items-center md:gap-1">
                          <span className="amt">{fmt(e.amountCents)}</span>
                          <div className="flex items-center -mr-2 md:mr-0">
                            <Link href={`/groups/${id}?edit=${e.id}`} className="icon-btn edit no-print inline-flex items-center" aria-label={`Edit ${e.description}`}><Icon name="edit" size={18} /></Link>
                            <form action={deleteExpense} className="no-print">
                              <input type="hidden" name="groupId" value={id} />
                              <input type="hidden" name="id" value={e.id} />
                              <button className="icon-btn inline-flex items-center" aria-label={`Delete ${e.description}`}><Icon name="delete" size={18} /></button>
                            </form>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {total > 0 && <p className="muted text-xs mt-2.5">Total spent: {fmt(total)}</p>}
                </section>
              </div>
              <div data-sec="group" className="contents"><SpendingCard members={members} expenses={withShares} me={mine.id} /></div>
            </div>

            <div className="contents md:flex md:flex-col md:gap-3">
              <div data-sec="balances" className="contents">
                <section className="card">
                  <h2>
                    Who Pays Whom
                    {expenses.length > 0 && <span className="badge">{transfers.length} {transfers.length === 1 ? "transaction" : "transactions"}</span>}
                  </h2>
                  {expenses.length === 0 ? <p className="empty">Settlement plan appears here.</p>
                    : transfers.length === 0 ? <div className="settled-banner">All settled up — nobody owes anything.</div>
                    : transfers.map((t) => (
                      <form key={`${t.from}-${t.to}`} action={settleUp} className="settle-row">
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="from" value={t.from} />
                        <input type="hidden" name="to" value={t.to} />
                        <input type="hidden" name="cents" value={t.cents} />
                        <span className="flex-1 min-w-0 leading-snug inline-flex flex-wrap items-center gap-x-1">
                          <b>{name(t.from)}</b> <Icon name="arrow_forward" size={16} className="text-[var(--gold)]" /> <b>{name(t.to)}</b>
                        </span>
                        <span className="amt">{fmt(t.cents)}</span>
                        <button className="btn-small no-print inline-flex items-center gap-1" title="Record this payment as done"><Icon name="check" size={18} /> Settle</button>
                      </form>
                    ))}
                  {settlements.length > 0 && (
                    <div className="mt-2">
                      <p className="muted text-xs mb-1">Recorded payments</p>
                      {settlements.map((s) => (
                        <form key={s.id} action={undoSettlement} className="list-row items-center">
                          <span>{name(s.fromMember)} paid {name(s.toMember)}</span>
                          <span className="flex items-center gap-1">
                            <span className="pos">{fmt(s.amountCents)}</span>
                            <input type="hidden" name="groupId" value={id} />
                            <input type="hidden" name="id" value={s.id} />
                            <button className="icon-btn no-print inline-flex items-center" aria-label="Undo payment"><Icon name="undo" size={18} /></button>
                          </span>
                        </form>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div data-sec="balances" className="contents">
                <section className="card">
                  <h2>Net Balances</h2>
                  {expenses.length === 0 ? <p className="empty">Add people and expenses to see balances.</p> : members.map((m) => {
                    const b = net.get(m.id) ?? 0;
                    return (
                      <div key={m.id} className="list-row">
                        <span>{m.name}</span>
                        <span className={b > 0 ? "pos" : b < 0 ? "neg" : "zero"}>
                          {b > 0 ? `gets back ${fmt(b)}` : b < 0 ? `owes ${fmt(b)}` : "settled"}
                        </span>
                      </div>
                    );
                  })}
                </section>
              </div>

              {cards.length > 0 && <div data-sec="group" className="contents"><CardPayments rows={cards} name={name} /></div>}
            </div>
          </div>

          <div data-sec="activity" className="contents"><ActivityLog rows={activity} me={mine.id} /></div>
        </div>
      </TabShell>
    </main>
  );
}

const ACTIVITY_ICON: Record<Action, string> = {
  group_created: "flag", member_joined: "person_add", person_added: "person_add",
  expense_added: "receipt_long", expense_edited: "edit", expense_deleted: "delete",
  settlement_recorded: "payments", settlement_removed: "undo",
};

function ActivityLog({ rows, me }: { rows: ActivityRow[]; me: string }) {
  const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const line = (a: ActivityRow) => {
    const who = a.actorId === me ? "You" : a.actorName ?? "Someone";
    const d = a.details;
    switch (a.action) {
      case "group_created": return `${who} created the group`;
      case "member_joined": return `${who} joined the group`;
      case "person_added": return `${who} added ${d.name}`;
      case "expense_added": return `${who} added “${d.description}”`;
      case "expense_edited": return `${who} edited “${d.description}”`;
      case "expense_deleted": return `${who} deleted “${d.description}”`;
      case "settlement_recorded": return `${who} recorded: ${d.fromName} paid ${d.toName}`;
      case "settlement_removed": return `${who} removed a payment from ${d.fromName} to ${d.toName}`;
    }
  };
  return (
    <section className="card">
      <h2>Activity</h2>
      {rows.length === 0 ? <p className="empty">Nothing has happened yet.</p> : rows.map((a) => (
        <div key={a.id} className="list-row items-start">
          <span className="inline-flex items-start gap-2 min-w-0">
            <Icon name={ACTIVITY_ICON[a.action]} size={18} className="muted mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="leading-snug">{line(a)}</span>
              <span className="muted text-xs block mt-0.5">{when(a.createdAt)}</span>
            </span>
          </span>
          {a.details.amountCents != null && <span className="amt shrink-0">{fmt(a.details.amountCents)}</span>}
        </div>
      ))}
    </section>
  );
}

function CardPayments({ rows, name }: { rows: ReturnType<typeof cardSummary>; name: (id: string) => string }) {
  const sum = (k: "total" | "ownShare" | "toCollect") => rows.reduce((a, r) => a + r[k], 0);
  const [total, own, collect] = [sum("total"), sum("ownShare"), sum("toCollect")];
  const SHARE = "#fcd34d", COLLECT = "#34d399", GAP = "#06251c";
  const deg = total ? (own / total) * 360 : 0;
  const bg = own === 0 ? COLLECT : collect === 0 ? SHARE
    : `conic-gradient(${SHARE} 1.6deg ${deg - 1.6}deg, ${GAP} ${deg - 1.6}deg ${deg + 1.6}deg, ${COLLECT} ${deg + 1.6}deg 358.4deg, ${GAP} 358.4deg 360deg)`;

  return (
    <section className="card">
      <h2 className="inline-flex items-center gap-1"><Icon name="credit_card" /> Card Payments <span className="badge">{fmt(total)}</span></h2>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col items-center gap-2 mx-auto">
          <div className="donut" style={{ background: bg }} role="img" aria-label={`${fmt(own)} own share, ${fmt(collect)} to collect`}>
            <div className="hole"><b>{fmt(total)}</b><span>on card</span></div>
          </div>
          <div className="legend flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1.5"><i style={{ background: SHARE }} />Their share <b className="ml-auto pl-2">{fmt(own)}</b></span>
            <span className="flex items-center gap-1.5"><i style={{ background: COLLECT }} />To collect <b className="ml-auto pl-2">{fmt(collect)}</b></span>
          </div>
        </div>
        <div className="flex-1 min-w-[260px] overflow-x-auto"><table className="spend min-w-[280px]">
          <thead><tr><th>Paid by</th><th>On card</th><th>Their share</th><th>To collect</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payer}>
                <td>{name(r.payer)}</td><td>{fmt(r.total)}</td><td>{fmt(r.ownShare)}</td>
                <td>{r.toCollect ? <span className="pos">{fmt(r.toCollect)}</span> : <span className="zero">—</span>}</td>
              </tr>
            ))}
            <tr className="total"><td>Total</td><td>{fmt(total)}</td><td>{fmt(own)}</td><td>{fmt(collect)}</td></tr>
          </tbody>
        </table></div>
      </div>
    </section>
  );
}
