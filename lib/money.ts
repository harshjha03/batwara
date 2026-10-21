// All amounts are integer cents.

export const CURRENCY = "₹";
export const fmt = (cents: number) =>
  CURRENCY + (Math.abs(cents) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "12.5" -> 1250. NaN if not a number. */
export const toCents = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  const c = Number.isFinite(n) ? Math.round(n * 100) : NaN;
  return Math.abs(c) > MAX_CENTS ? NaN : c;
};
/** Largest amount the integer columns can hold (int4). */
export const MAX_CENTS = 2_147_483_647;
export const validCents = (c: number) => Number.isInteger(c) && c > 0 && c <= MAX_CENTS;

export type SplitMode = "equal" | "exact" | "percent" | "shares";
export type SplitInput = { memberId: string; value?: number };
export type Share = { memberId: string; cents: number };

export function splitAmount(totalCents: number, mode: SplitMode, inputs: SplitInput[]): Share[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("Amount must be positive");
  if (inputs.length === 0) throw new Error("Pick at least one person");
  if (mode !== "equal" && inputs.some((i) => !Number.isFinite(i.value))) throw new Error("Fill in a number for everyone");

  if (mode === "exact") {
    const shares = inputs.map((i) => ({ memberId: i.memberId, cents: Math.round(i.value ?? 0) }));
    if (shares.some((s) => s.cents < 0)) throw new Error("Shares can't be negative");
    if (shares.reduce((a, s) => a + s.cents, 0) !== totalCents) throw new Error("Exact amounts must add up to the total");
    return shares;
  }

  const weights = inputs.map((i) => (mode === "equal" ? 1 : i.value ?? 0));
  if (weights.some((w) => w < 0)) throw new Error("Values can't be negative");
  const sum = weights.reduce((a, w) => a + w, 0);
  if (mode === "percent" && Math.abs(sum - 100) > 1e-9) throw new Error("Percentages must add up to 100");
  if (!Number.isFinite(sum) || sum <= 0) throw new Error("Shares must be greater than zero");

  const shares = inputs.map((i, k) => ({ memberId: i.memberId, cents: Math.floor((totalCents * weights[k]) / sum) }));
  // ponytail: leftover cents go to the first members in order, not by largest remainder
  let left = totalCents - shares.reduce((a, s) => a + s.cents, 0);
  for (let k = 0; left > 0; k = (k + 1) % shares.length) {
    if (weights[k] > 0) { shares[k].cents++; left--; }
  }
  // Invariant: every cent is accounted for exactly once (guards any float drift).
  if (shares.reduce((a, s) => a + s.cents, 0) !== totalCents) throw new Error("Shares must be greater than zero");
  return shares;
}

export type Expense = { id: string; paidBy: string; amountCents: number; paymentMethod?: string };
export type Split = { expenseId: string; memberId: string; shareCents: number };
export type Settlement = { fromMember: string; toMember: string; amountCents: number };

/** Positive = is owed money, negative = owes money. */
export function balances(expenses: Expense[], splits: Split[], settlements: Settlement[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (u: string, c: number) => net.set(u, (net.get(u) ?? 0) + c);
  for (const e of expenses) add(e.paidBy, e.amountCents);
  for (const s of splits) add(s.memberId, -s.shareCents);
  for (const s of settlements) { add(s.fromMember, s.amountCents); add(s.toMember, -s.amountCents); }
  return net;
}

export type Transfer = { from: string; to: string; cents: number };

/** Greedy: biggest debtor pays biggest creditor. At most n-1 transfers. */
export function simplifyDebts(net: Map<string, number>): Transfer[] {
  const creditors = [...net].filter(([, c]) => c > 0).map(([u, c]) => ({ u, c }));
  const debtors = [...net].filter(([, c]) => c < 0).map(([u, c]) => ({ u, c: -c }));
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.c - a.c);
    debtors.sort((a, b) => b.c - a.c);
    const cr = creditors[0], db = debtors[0];
    const cents = Math.min(cr.c, db.c);
    out.push({ from: db.u, to: cr.u, cents });
    cr.c -= cents; db.c -= cents;
    if (!cr.c) creditors.shift();
    if (!db.c) debtors.shift();
  }
  return out;
}

export type CardRow = { payer: string; total: number; ownShare: number; toCollect: number };

/** Per card payer: what went on their card, their own share of it, and what to collect back. */
export function cardSummary(expenses: Expense[], splits: Split[]): CardRow[] {
  const rows = new Map<string, CardRow>();
  for (const e of expenses) {
    if (e.paymentMethod !== "card") continue;
    const r = rows.get(e.paidBy) ?? { payer: e.paidBy, total: 0, ownShare: 0, toCollect: 0 };
    const own = splits.find((s) => s.expenseId === e.id && s.memberId === e.paidBy)?.shareCents ?? 0;
    r.total += e.amountCents;
    r.ownShare += own;
    r.toCollect += e.amountCents - own;
    rows.set(e.paidBy, r);
  }
  return [...rows.values()];
}
