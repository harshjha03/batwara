import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/supabase";
import { createGroup, signOut } from "@/app/actions";

export const instant = false;

// Opens your most recent group; only shows this screen when you have none yet.
export default async function Home() {
  const me = await requireUser();
  const last = (await cookies()).get("last_group")?.value;
  const groups = await sql<{ id: string }[]>`
    select g.id from groups g join group_members m on m.group_id = g.id and m.user_id = ${me} order by g.created_at desc`;
  const target = groups.find((g) => g.id === last) ?? groups[0];
  if (target) redirect(`/groups/${target.id}`);

  return (
    <>
      <div className="orb a" /><div className="orb b" />
      <main className="relative mx-auto w-full flex flex-col justify-center px-[30px]" style={{ maxWidth: "var(--app)", minHeight: "100dvh", zIndex: 1 }}>
        <div className="flex items-center justify-between mb-8">
          <span className="brand serif font-bold" style={{ fontSize: 24 }}>Batwara</span>
          <form action={signOut}><button className="pill">Sign out</button></form>
        </div>
        <h1 className="serif font-bold text-[28px] text-white mb-1.5">Create your first group</h1>
        <p className="muted text-sm mb-6">A trip, a flat, a dinner — anything you split.</p>
        <div className="card !rounded-[20px] !p-5">
          <div className="eyebrow mb-2">Group name</div>
          <form action={createGroup}>
            <input className="inp" name="name" required maxLength={80} placeholder="e.g. Flat expenses, Weekend trip" aria-label="Group name" />
            <button className="btn w-full mt-4">Create group</button>
          </form>
          <p className="faint text-xs mt-3">Or open an invite link someone sent you.</p>
        </div>
      </main>
    </>
  );
}
