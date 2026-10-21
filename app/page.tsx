import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { createGroup, signOut } from "@/app/actions";

// Per-user page: blocks on the server, nothing to prerender.
export const instant = false;

// Opens your last group (or newest); only shows a page when you have none yet.
export default async function Home() {
  const me = await requireUser();
  const last = (await cookies()).get("last_group")?.value;
  const groups = await sql<{ id: string }[]>`
    select g.id from groups g join group_members m on m.group_id = g.id and m.user_id = ${me} order by g.created_at desc`;
  const target = groups.find((g) => g.id === last) ?? groups[0];
  if (target) redirect(`/groups/${target.id}`);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-4 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <span className="brand">Batwara</span>
        <form action={signOut}><button className="btn-small btn-cancel">Sign out</button></form>
      </header>
      <section className="card mt-[6vh]">
        <h2>Create your first group</h2>
        <form action={createGroup} className="flex gap-2">
          <input name="name" required maxLength={80} placeholder="Group name (e.g., Goa Trip)" aria-label="Group name" />
          <button className="btn">Create</button>
        </form>
        <p className="muted text-xs mt-3">Or open an invite link someone sent you.</p>
      </section>
    </main>
  );
}
