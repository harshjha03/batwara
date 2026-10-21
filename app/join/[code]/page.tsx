import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sql, isUuid } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { joinGroup, joinAs } from "@/app/actions";
import { fmt } from "@/lib/money";
import { Avatar } from "@/components/icon";

export const instant = false;

const ERR: Record<string, string> = {
  used: "That personal invite has already been used. You can still join as a new member.",
  history: "You already have expenses in this group, so you can't take over another name.",
};

// A button instead of auto-joining on GET, so link previews/prefetches can't add you to a group.
// With ?as=<memberId> this is a personal invite: joining takes over that guest's expenses and balance.
export default async function Join({ params, searchParams }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const { as, err, preview } = await searchParams;
  const isPreview = preview === "1";
  const me = await requireUser();
  const [g] = await sql<{ id: string; name: string; member: boolean; total: number; members: number }[]>`
    select g.id, g.name, exists (select 1 from group_members where group_id = g.id and user_id = ${me}) as member,
      coalesce((select sum(amount_cents) from expenses where group_id = g.id and deleted_at is null), 0)::int total,
      (select count(*) from group_members where group_id = g.id)::int members
    from groups g where invite_code = ${code}`;
  if (!g) notFound();

  const asId = typeof as === "string" && isUuid(as) ? as : null;
  const [ghost] = asId ? await sql<{ id: string; name: string }[]>`
    select id, name from group_members where id = ${asId} and group_id = ${g.id} and user_id is null` : [];
  if (g.member && !ghost && !isPreview) redirect(`/groups/${g.id}`);
  const error = typeof err === "string" ? ERR[err] : undefined;

  return (
    <>
      <div className="orb a" /><div className="orb b" />
      <main className="relative mx-auto w-full flex flex-col justify-center px-[30px]" style={{ maxWidth: "var(--app)", minHeight: "100dvh", zIndex: 1 }}>
        <div className="text-center mb-5"><span className="brand serif font-bold" style={{ fontSize: 24 }}>Batwara</span></div>
        <div className="card !rounded-[22px] !p-6 text-center">
          <div className="eyebrow">You&apos;re invited to join</div>
          <div className="serif font-bold text-[26px] text-white mt-1 mb-0.5">{g.name}</div>
          <div className="text-[12.5px] muted">{fmt(g.total)} tracked across the group</div>
          {error && <p className="neg text-[12.5px] mt-4 leading-normal" role="alert">{error}</p>}

          {ghost ? (
            <>
              <div className="h-px my-5" style={{ background: "var(--line)" }} />
              <div className="flex items-center justify-center gap-2.5 mb-2">
                <Avatar name={ghost.name} size={40} ring="var(--gold)" tint="var(--gold)" />
                <div className="text-left"><div className="text-[11px] muted">Joining as</div><div className="text-[16px] font-semibold text-white">{ghost.name}</div></div>
              </div>
              <p className="text-[12.5px] muted leading-relaxed mb-5">You&apos;ll take over {ghost.name}&apos;s expenses and balance. This can&apos;t be changed once confirmed.</p>
              {isPreview ? (
                <button className="btn w-full !h-[52px]" disabled aria-disabled="true">Join as {ghost.name}</button>
              ) : (
                <form action={joinAs}>
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="memberId" value={ghost.id} />
                  <button className="btn w-full !h-[52px]">Join as {ghost.name}</button>
                </form>
              )}
            </>
          ) : (
            <form action={joinGroup} className="mt-5">
              <input type="hidden" name="code" value={code} />
              <button className="btn w-full !h-[52px]">Join group</button>
            </form>
          )}
        </div>
        {isPreview ? (
          <>
            <p className="faint text-[12px] text-center mt-5">Preview — this is what {ghost?.name ?? "they"} will see. Nothing happens from here.</p>
            <Link href={`/groups/${g.id}`} className="block text-center mt-2 h-11 leading-[44px] mint text-[13px] font-semibold">Back to group</Link>
          </>
        ) : (
          <Link href="/" className="block text-center mt-3.5 h-11 leading-[44px] muted text-[13px] font-semibold">Not now</Link>
        )}
      </main>
    </>
  );
}
