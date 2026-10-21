import { NextResponse, type NextRequest } from "next/server";
import { supabase, safeNext } from "@/lib/supabase";
import { sql } from "@/lib/db";

// Google sends the user back here after sign-in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const { data, error } = await (await supabase()).auth.exchangeCodeForSession(code);
    if (!error) {
      const u = data.user;
      const name = u.user_metadata.full_name ?? u.user_metadata.name ?? u.email?.split("@")[0] ?? "Someone";
      await sql`
        insert into profiles (id, name, email) values (${u.id}, ${name}, ${u.email ?? null})
        on conflict (id) do update set name = excluded.name, email = excluded.email`;
      return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=1", origin));
}
