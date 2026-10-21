import { notFound } from "next/navigation";
import { sql, groupMembers } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { balances, simplifyDebts, cardSummary, type Expense, type Split, type Settlement } from "@/lib/money";
import { type Action } from "@/app/actions";
import { GroupApp, type AppData } from "./app";

export const instant = false;

type Row = Expense & { description: string; paymentMethod: string };
type ActivityRow = { id: number; actorId: string | null; actorName: string | null; action: Action; details: Record<string, string | number>; createdAt: Date };

const ICON: Record<Action, { icon: string; tone: "mint" | "gold" | "neg" }> = {
  group_created: { icon: "scale", tone: "mint" }, member_joined: { icon: "person-add", tone: "mint" }, person_added: { icon: "person-add", tone: "mint" },
  expense_added: { icon: "receipt", tone: "mint" }, expense_edited: { icon: "edit", tone: "gold" }, expense_deleted: { icon: "delete", tone: "neg" },
  settlement_recorded: { icon: "check", tone: "gold" }, settlement_removed: { icon: "undo", tone: "neg" },
};

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const me = await requireUser();
  const roster = await groupMembers(id);
  const mine = roster.find((m) => m.userId === me);
  if (!mine) notFound();

  const [groups, expenses, splits, settlements, activity] = await Promise.all([
    sql<{ id: string; name: string; inviteCode: string; total: number }[]>`
      select g.id, g.name, g.invite_code,
        coalesce((select sum(amount_cents) from expenses where group_id = g.id and deleted_at is null), 0)::int total
      from groups g join group_members m on m.group_id = g.id and m.user_id = ${me} order by g.created_at`,
    sql<Row[]>`select id, description, amount_cents, paid_by, payment_method from expenses
      where group_id = ${id} and deleted_at is null order by created_at desc`,
    sql<Split[]>`select s.expense_id, s.member_id, s.share_cents from expense_splits s join expenses e on e.id = s.expense_id
      where e.group_id = ${id} and e.deleted_at is null`,
    sql<(Settlement & { id: string })[]>`select id, from_member, to_member, amount_cents from settlements where group_id = ${id} order by created_at desc`,
    sql<ActivityRow[]>`select a.id, a.actor_id, a.action, a.details, a.created_at, p.name as actor_name
      from activity a left join profiles p on p.id = a.actor_id where a.group_id = ${id} order by a.created_at desc limit 100`,
  ]);
  const group = groups.find((g) => g.id === id)!;

  const sharesOf = new Map<string, { memberId: string; cents: number }[]>();
  for (const s of splits) (sharesOf.get(s.expenseId) ?? sharesOf.set(s.expenseId, []).get(s.expenseId)!).push({ memberId: s.memberId, cents: s.shareCents });

  const net = balances(expenses, splits, settlements);
  // Pinned to IST: Vercel renders in UTC, and the app is en-IN / rupees throughout.
  const fmtTime = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const line = (a: ActivityRow) => {
    const who = a.actorId === me ? "You" : a.actorName ?? "Someone";
    const d = a.details;
    switch (a.action) {
      case "group_created": return `${who} created the group`;
      case "member_joined": return d.name ? `${who} joined as ${d.name}` : `${who} joined the group`;
      case "person_added": return `${who} added ${d.name}`;
      case "expense_added": return `${who} added “${d.description}”`;
      case "expense_edited": return `${who} edited “${d.description}”`;
      case "expense_deleted": return `${who} deleted “${d.description}”`;
      case "settlement_recorded": return `${who} recorded ${d.fromName} → ${d.toName}`;
      case "settlement_removed": return `${who} removed ${d.fromName} → ${d.toName}`;
    }
  };

  const data: AppData = {
    me: mine.id,
    group: { id, name: group.name, inviteCode: group.inviteCode },
    groups: groups.map((g) => ({ id: g.id, name: g.name, total: g.total })),
    members: roster.map((m) => ({ id: m.id, userId: m.userId, name: m.name, isMe: m.id === mine.id })),
    expenses: expenses.map((e) => ({
      id: e.id, description: e.description, amountCents: e.amountCents, paidBy: e.paidBy,
      paymentMethod: e.paymentMethod, shares: sharesOf.get(e.id) ?? [],
    })),
    settlements: settlements.map((s) => ({ id: s.id, fromMember: s.fromMember, toMember: s.toMember, amountCents: s.amountCents })),
    net: [...net].map(([memberId, cents]) => ({ memberId, cents })),
    transfers: simplifyDebts(net),
    cards: cardSummary(expenses, splits),
    total: expenses.reduce((a, e) => a + e.amountCents, 0),
    myHistory: expenses.some((e) => e.paidBy === mine.id) || splits.some((s) => s.memberId === mine.id)
      || settlements.some((s) => s.fromMember === mine.id || s.toMember === mine.id),
    activity: activity.map((a) => ({ id: a.id, ...ICON[a.action], text: line(a)!, time: fmtTime(a.createdAt), amountCents: typeof a.details.amountCents === "number" ? a.details.amountCents : null })),
  };
  return <GroupApp data={data} />;
}
