"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { sql, isUuid, groupMembers } from "@/lib/db";
import type postgres from "postgres";
import { supabase, requireUser } from "@/lib/supabase";
import { splitAmount, toCents, validCents, balances, type SplitMode, type Expense, type Split, type Settlement } from "@/lib/money";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Members of the group, plus my own member row; null if I'm not in it. */
async function membership(groupId: string, me: string) {
  const members = await groupMembers(groupId);
  const mine = members.find((m) => m.userId === me);
  return mine ? { members, mine, ids: new Set(members.map((m) => m.id)), name: (id: string) => members.find((x) => x.id === id)?.name ?? "someone" } : null;
}

export type Action =
  | "group_created" | "member_joined" | "person_added"
  | "expense_added" | "expense_edited" | "expense_deleted"
  | "settlement_recorded" | "settlement_removed";

// db is `sql` or a transaction `tx`; details keys are camelCase (stored verbatim in jsonb).
const logActivity = (db: postgres.Sql | postgres.TransactionSql, groupId: string, actorId: string, action: Action, details: Record<string, string | number>) =>
  db`insert into activity (group_id, actor_id, action, details) values (${groupId}, ${actorId}, ${action}, ${db.json(details as postgres.JSONValue)})`;

export type FormState = { error?: string; ok?: number };

export async function signOut() {
  await (await supabase()).auth.signOut();
  redirect("/login");
}

export async function createGroup(fd: FormData) {
  const me = await requireUser();
  const name = str(fd, "name").slice(0, 80);
  if (!name) return;
  const id = await sql.begin(async (tx) => {
    const [g] = await tx<{ id: string }[]>`
      insert into groups (name, invite_code, created_by)
      values (${name}, ${randomBytes(6).toString("base64url")}, ${me}) returning id`;
    await tx`insert into group_members (group_id, user_id, name) values (${g.id}, ${me}, (select name from profiles where id = ${me}))`;
    await logActivity(tx, g.id, me, "group_created", { name });
    return g.id;
  });
  redirect(`/groups/${id}`);
}

export async function joinGroup(fd: FormData) {
  const me = await requireUser();
  const [g] = await sql<{ id: string }[]>`select id from groups where invite_code = ${str(fd, "code")}`;
  if (!g) notFound();
  await sql.begin(async (tx) => {
    const joined = await tx`
      insert into group_members (group_id, user_id, name) values (${g.id}, ${me}, (select name from profiles where id = ${me}))
      on conflict (group_id, user_id) do nothing returning id`;
    if (joined.length) await logActivity(tx, g.id, me, "member_joined", {});
  });
  redirect(`/groups/${g.id}`);
}

/** Personal invite: join the group by taking over a guest (ghost) row — its expenses and balance become yours. */
export async function joinAs(fd: FormData) {
  const me = await requireUser();
  const code = str(fd, "code");
  const memberId = str(fd, "memberId");
  const [g] = await sql<{ id: string }[]>`select id from groups where invite_code = ${code}`;
  if (!g || !isUuid(memberId)) notFound();
  const back = (err: string) => redirect(`/join/${encodeURIComponent(code)}?as=${memberId}&err=${err}`);
  try {
    const ok = await sql.begin(async (tx) => {
      const [ghost] = await tx<{ id: string; name: string }[]>`
        select id, name from group_members where id = ${memberId} and group_id = ${g.id} and user_id is null for update`;
      if (!ghost) return "used";
      // Already in the group under a fresh row? Fold it into the ghost (FKs refuse if that row has history).
      await tx`delete from group_members where group_id = ${g.id} and user_id = ${me}`;
      await tx`update group_members set user_id = ${me} where id = ${ghost.id}`;
      await logActivity(tx, g.id, me, "member_joined", { name: ghost.name });
      return "ok";
    });
    if (ok !== "ok") back(ok);
  } catch (e) {
    if ((e as { code?: string }).code === "23503") back("history");
    throw e;
  }
  redirect(`/groups/${g.id}`);
}

// ---------- people ----------

export async function addPerson(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const m = await membership(groupId, me);
  if (!m) return { error: "You're not in this group" };
  const name = str(fd, "name").slice(0, 60);
  if (!name) return {};
  if (m.members.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: `${name} already exists.` };
  await sql.begin(async (tx) => {
    await tx`insert into group_members (group_id, name) values (${groupId}, ${name})`;
    await logActivity(tx, groupId, me, "person_added", { name });
  });
  revalidatePath(`/groups/${groupId}`);
  return { ok: Date.now() };
}

/** Only ghosts can be removed, and only while they have no money history. */
export async function removePerson(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const m = await membership(groupId, me);
  const ghost = m?.members.find((x) => x.id === str(fd, "memberId") && !x.userId);
  if (!ghost) return { error: "Can't remove that person" };
  try {
    await sql`delete from group_members where id = ${ghost.id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return { error: `${ghost.name} is part of existing expenses. Remove those expenses first.` };
    throw e;
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: Date.now() };
}

/** "This is me": take over a ghost. ponytail: only while my own member row has no history, so nothing needs merging. */
export async function claimMember(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const m = await membership(groupId, me);
  const ghost = m?.members.find((x) => x.id === str(fd, "memberId") && !x.userId);
  if (!m || !ghost) return { error: "That person can't be claimed" };
  try {
    await sql.begin(async (tx) => {
      await tx`delete from group_members where id = ${m.mine.id}`; // FKs refuse if I already have history
      // Conditional on the ghost still being unclaimed, so two people racing for one name can't both "win".
      const [ok] = await tx`update group_members set user_id = ${me} where id = ${ghost.id} and user_id is null returning id`;
      if (!ok) throw Object.assign(new Error("claimed"), { code: "CLAIMED" });
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23503") return { error: "You already have expenses here, so you can't switch names." };
    if (code === "CLAIMED") return { error: "Someone else just claimed that name." };
    throw e;
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: Date.now() };
}

export async function renameGroup(fd: FormData) {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const name = str(fd, "name").slice(0, 80);
  if (!name || !(await membership(groupId, me))) return;
  await sql`update groups set name = ${name} where id = ${groupId}`;
  revalidatePath(`/groups/${groupId}`);
}

/** Leaving = becoming a ghost: you lose access but your expense history stays under your name. */
export async function leaveGroup(fd: FormData) {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const m = await membership(groupId, me);
  if (!m) return;
  await sql`update group_members set user_id = null where id = ${m.mine.id}`;
  redirect("/");
}

// ---------- expenses ----------

/** Adds a new expense, or edits one when expenseId is set. */
export async function saveExpense(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const m = await membership(groupId, me);
  if (!m) return { error: "You're not in this group" };

  const expenseId = str(fd, "expenseId");
  const description = str(fd, "description").slice(0, 120);
  const amountCents = toCents(fd.get("amount"));
  const paidBy = str(fd, "paidBy");
  const method = str(fd, "paymentMethod") === "card" ? "card" : "cash";
  const mode = str(fd, "mode") as SplitMode;
  if (!description) return { error: "Enter a description." };
  if (!validCents(amountCents)) return { error: "Enter a valid amount." };
  const clientId = str(fd, "clientId"); // idempotency key for new expenses (a retried submit can't double-insert)
  if (clientId && !isUuid(clientId)) return { error: "Enter a valid amount." };
  if (!m.ids.has(paidBy)) return { error: "Pick who paid." };
  if (!["equal", "exact", "percent", "shares"].includes(mode)) return { error: "Pick a split type." };

  const ids = [...new Set(fd.getAll("include").map(String))].filter((id) => m.ids.has(id));
  const inputs = ids.map((memberId) => {
    const raw = fd.get(`v_${memberId}`);
    return { memberId, value: mode === "exact" ? toCents(raw) : Number(String(raw ?? "").trim() || NaN) };
  });

  let shares;
  try { shares = splitAmount(amountCents, mode, inputs); } catch (e) { return { error: (e as Error).message }; }
  const rows = (id: string) => shares.filter((s) => s.cents > 0).map((s) => ({ expenseId: id, memberId: s.memberId, shareCents: s.cents }));

  if (expenseId) {
    if (!isUuid(expenseId)) return { error: "Expense not found" };
    const updated = await sql.begin(async (tx) => {
      const [e] = await tx<{ id: string }[]>`
        update expenses set description = ${description}, amount_cents = ${amountCents}, paid_by = ${paidBy},
          payment_method = ${method}, updated_at = now()
        where id = ${expenseId} and group_id = ${groupId} and deleted_at is null returning id`;
      if (!e) return false;
      await tx`delete from expense_splits where expense_id = ${e.id}`;
      await tx`insert into expense_splits ${tx(rows(e.id))}`;
      await logActivity(tx, groupId, me, "expense_edited", { description, amountCents });
      return true;
    });
    if (!updated) return { error: "That expense was deleted." };
    revalidatePath(`/groups/${groupId}`);
    return { ok: Date.now() };
  }

  await sql.begin(async (tx) => {
    const [e] = clientId
      ? await tx<{ id: string }[]>`
          insert into expenses (id, group_id, description, amount_cents, paid_by, payment_method, created_by)
          values (${clientId}, ${groupId}, ${description}, ${amountCents}, ${paidBy}, ${method}, ${me})
          on conflict (id) do nothing returning id`
      : await tx<{ id: string }[]>`
          insert into expenses (group_id, description, amount_cents, paid_by, payment_method, created_by)
          values (${groupId}, ${description}, ${amountCents}, ${paidBy}, ${method}, ${me}) returning id`;
    if (!e) return; // already saved by an earlier attempt
    await tx`insert into expense_splits ${tx(rows(e.id))}`;
    await logActivity(tx, groupId, me, "expense_added", { description, amountCents });
  });
  revalidatePath(`/groups/${groupId}`);
  return { ok: Date.now() };
}

/** Soft delete: the row stays for history, it just stops counting. */
export async function deleteExpense(fd: FormData) {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const id = str(fd, "id");
  if (!isUuid(id) || !(await membership(groupId, me))) return;
  await sql.begin(async (tx) => {
    const [e] = await tx<{ description: string; amountCents: number }[]>`
      update expenses set deleted_at = now() where id = ${id} and group_id = ${groupId} and deleted_at is null
      returning description, amount_cents`;
    if (e) await logActivity(tx, groupId, me, "expense_deleted", { description: e.description, amountCents: e.amountCents });
  });
  revalidatePath(`/groups/${groupId}`);
}

// ---------- settlements ----------

export async function settleUp(fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const from = str(fd, "from");
  const to = str(fd, "to");
  const cents = Number(str(fd, "cents"));
  const m = await membership(groupId, me);
  if (!m || !m.ids.has(from) || !m.ids.has(to) || from === to || !validCents(cents)) return { error: "Couldn't record that payment." };
  const stale = await sql.begin(async (tx) => {
    // Re-derive the live balance inside the transaction: a double tap, a stale screen or two phones
    // settling the same debt must not record a second payment and flip who owes whom.
    const [expenses, splits, settlements] = await Promise.all([
      tx<Expense[]>`select id, paid_by, amount_cents from expenses where group_id = ${groupId} and deleted_at is null`,
      tx<Split[]>`select s.expense_id, s.member_id, s.share_cents from expense_splits s join expenses e on e.id = s.expense_id where e.group_id = ${groupId} and e.deleted_at is null`,
      tx<Settlement[]>`select from_member, to_member, amount_cents from settlements where group_id = ${groupId} for update`,
    ]);
    const net = balances(expenses, splits, settlements);
    if (cents > -(net.get(from) ?? 0) || cents > (net.get(to) ?? 0)) return true;
    await tx`insert into settlements (group_id, from_member, to_member, amount_cents, created_by)
      values (${groupId}, ${from}, ${to}, ${cents}, ${me})`;
    await logActivity(tx, groupId, me, "settlement_recorded", { fromName: m.name(from), toName: m.name(to), amountCents: cents });
    return false;
  });
  revalidatePath(`/groups/${groupId}`);
  return stale ? { error: "That balance already changed. Refreshed — check again." } : { ok: Date.now() };
}

export async function undoSettlement(fd: FormData) {
  const me = await requireUser();
  const groupId = str(fd, "groupId");
  const id = str(fd, "id");
  const m = await membership(groupId, me);
  if (!isUuid(id) || !m) return;
  await sql.begin(async (tx) => {
    const [s] = await tx<{ fromMember: string; toMember: string; amountCents: number }[]>`
      delete from settlements where id = ${id} and group_id = ${groupId} returning from_member, to_member, amount_cents`;
    if (s) await logActivity(tx, groupId, me, "settlement_removed", { fromName: m.name(s.fromMember), toName: m.name(s.toMember), amountCents: s.amountCents });
  });
  revalidatePath(`/groups/${groupId}`);
}
