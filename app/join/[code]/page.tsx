import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { joinGroup } from "@/app/actions";

// Per-user page: blocks on the server, nothing to prerender.
export const instant = false;

// A button instead of auto-joining on GET, so link previews/prefetches can't add you to a group.
export default async function Join({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const me = await requireUser();
  const [g] = await sql<{ id: string; name: string; member: boolean }[]>`
    select g.id, g.name, exists (select 1 from group_members where group_id = g.id and user_id = ${me}) as member
    from groups g where invite_code = ${code}`;
  if (!g) notFound();
  if (g.member) redirect(`/groups/${g.id}`);

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[12vh]">
      <section className="card text-center flex flex-col gap-3">
        <span className="brand">Batwara</span>
        <p className="muted">You&apos;ve been invited to</p>
        <h1 className="text-2xl font-bold text-white">{g.name}</h1>
        <form action={joinGroup}>
          <input type="hidden" name="code" value={code} />
          <button className="btn w-full">Join group</button>
        </form>
      </section>
    </main>
  );
}
