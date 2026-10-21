import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export async function supabase() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; proxy.ts refreshes the session there instead.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}

/** Signed-in user's id, or bounce to /login. */
export async function requireUser(): Promise<string> {
  await connection(); // per-request: getClaims() checks token expiry against the clock
  const { data } = await (await supabase()).auth.getClaims();
  if (!data?.claims) redirect("/login");
  return data.claims.sub;
}

/** Only allow same-site relative redirects (no //evil.com). */
export const safeNext = (n: string | null | undefined) =>
  n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
