import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabase, safeNext } from "@/lib/supabase";

// Per-user page: blocks on the server, nothing to prerender.
export const instant = false;

const callback = async (next: string) =>
  `${(await headers()).get("origin")}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

async function signInGoogle(formData: FormData) {
  "use server";
  const { data, error } = await (await supabase()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callback(String(formData.get("next") ?? "")) },
  });
  if (error) throw error;
  redirect(data.url);
}

async function sendMagicLink(formData: FormData) {
  "use server";
  const next = String(formData.get("next") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { error } = await (await supabase()).auth.signInWithOtp({ email, options: { emailRedirectTo: await callback(next) } });
  redirect(`/login?next=${encodeURIComponent(next)}&${error ? "error=" + encodeURIComponent(error.message) : "sent=1"}`);
}

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { next, error, sent } = await searchParams;
  const n = typeof next === "string" ? next : "/";
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[12vh]">
      <section className="card">
        <h1 className="brand mb-1">Batwara</h1>
        <p className="muted mb-4">Sign in to track shared expenses with your group.</p>
        <form action={signInGoogle}>
          <input type="hidden" name="next" value={n} />
          <button className="btn w-full">Continue with Google</button>
        </form>
        <p className="mini-lbl text-center my-3">— or —</p>
        <form action={sendMagicLink} className="flex gap-2">
          <input type="hidden" name="next" value={n} />
          <input type="email" name="email" required placeholder="you@email.com" aria-label="Email" />
          <button className="btn">Magic link</button>
        </form>
        <p className="err mt-2" role="alert">{typeof error === "string" && (error === "1" ? "Sign-in failed. Try again." : error)}</p>
        {sent && <p className="text-[#9dffdb] text-sm">Check your email for the sign-in link.</p>}
      </section>
    </main>
  );
}
