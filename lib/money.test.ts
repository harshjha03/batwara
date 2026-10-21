import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAmount, balances, simplifyDebts, cardSummary } from "./money.ts";

const sum = (xs: { cents: number }[]) => xs.reduce((a, x) => a + x.cents, 0);
const abc = [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }];

test("equal split keeps every cent", () => {
  const s = splitAmount(1000, "equal", abc);
  assert.deepEqual(s.map((x) => x.cents), [334, 333, 333]);
});

test("percent, shares, exact", () => {
  assert.equal(sum(splitAmount(999, "percent", [{ memberId: "a", value: 33.33 }, { memberId: "b", value: 66.67 }])), 999);
  assert.deepEqual(splitAmount(600, "shares", [{ memberId: "a", value: 1 }, { memberId: "b", value: 2 }]).map((x) => x.cents), [200, 400]);
  assert.deepEqual(splitAmount(500, "shares", [{ memberId: "a", value: 0 }, { memberId: "b", value: 3 }]).map((x) => x.cents), [0, 500]);
  assert.throws(() => splitAmount(500, "exact", [{ memberId: "a", value: 100 }]));
  assert.throws(() => splitAmount(500, "percent", [{ memberId: "a", value: 90 }]));
});

test("balances and simplification settle to zero", () => {
  // a paid 300 for all three, b paid 600 for all three
  const exp = [{ id: "1", paidBy: "a", amountCents: 300 }, { id: "2", paidBy: "b", amountCents: 600 }];
  const splits = ["a", "b", "c"].flatMap((u) => [
    { expenseId: "1", memberId: u, shareCents: 100 },
    { expenseId: "2", memberId: u, shareCents: 200 },
  ]);
  const net = balances(exp, splits, []);
  assert.deepEqual(Object.fromEntries(net), { a: 0, b: 300, c: -300 });
  const t = simplifyDebts(net);
  assert.deepEqual(t, [{ from: "c", to: "b", cents: 300 }]);

  const after = balances(exp, splits, [{ fromMember: "c", toMember: "b", amountCents: 300 }]);
  assert.ok([...after.values()].every((v) => v === 0));
});

test("card summary: own share vs to collect", () => {
  const exp = [
    { id: "1", paidBy: "a", amountCents: 900, paymentMethod: "card" },
    { id: "2", paidBy: "a", amountCents: 500, paymentMethod: "card" }, // a not in this split
    { id: "3", paidBy: "b", amountCents: 999, paymentMethod: "cash" },
  ];
  const splits = [
    { expenseId: "1", memberId: "a", shareCents: 300 },
    { expenseId: "1", memberId: "b", shareCents: 600 },
    { expenseId: "2", memberId: "b", shareCents: 500 },
  ];
  assert.deepEqual(cardSummary(exp, splits), [{ payer: "a", total: 1400, ownShare: 300, toCollect: 1100 }]);
});
