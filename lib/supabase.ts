import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env, cookieOptions } from "./env";

export async function supabase() {
  const store = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions,
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

/**
 * Only allow same-origin, path-only redirects. Parsed through the URL parser (not string
 * prefixes) so `/\t/evil.com`, `/\\evil.com` and friends normalise and get rejected.
 */
export const safeNext = (n: string | null | undefined) => {
  try {
    const u = new URL(n || "/", "http://x");
    return u.origin === "http://x" && u.pathname.startsWith("/") ? u.pathname + u.search + u.hash : "/";
  } catch { return "/"; }
};
