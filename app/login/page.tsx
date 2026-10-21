import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabase, safeNext } from "@/lib/supabase";
import { Icon } from "@/components/icon";

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
    <>
      <div className="orb a" /><div className="orb b" />
      <main className="relative mx-auto w-full flex flex-col justify-center px-[30px]" style={{ maxWidth: "var(--app)", minHeight: "100dvh", zIndex: 1 }}>
        <div className="text-center mb-[34px]">
          <div className="brand" style={{ fontSize: 46, lineHeight: 1 }}>Batwara</div>
          <div className="muted mt-3 text-sm">Shared expenses, settled to the paisa.</div>
        </div>
        <div className="card !rounded-[22px] !p-6">
          <form action={signInGoogle}>
            <input type="hidden" name="next" value={n} />
            <button className="w-full h-[50px] flex items-center justify-center gap-2.5 rounded-[13px] font-semibold text-[15px]" style={{ background: "#fff", color: "#1a1a1a" }}>
              <Icon name="google" size={18} /> Continue with Google
            </button>
          </form>
          <div className="flex items-center gap-3 my-[18px] faint text-xs"><div className="flex-1 h-px" style={{ background: "var(--line)" }} />or<div className="flex-1 h-px" style={{ background: "var(--line)" }} /></div>
          <form action={sendMagicLink} className="flex gap-2.5">
            <input type="hidden" name="next" value={n} />
            <input className="inp" type="email" name="email" required placeholder="you@email.com" aria-label="Email" />
            <button className="btn !px-[17px]">Magic link</button>
          </form>
          {typeof error === "string" && <p className="neg text-xs mt-3" role="alert">{error === "1" ? "Sign-in failed. Try again." : error}</p>}
          {sent ? <p className="mint text-[12.5px] text-center mt-3">Check your email for the sign-in link.</p>
            : <p className="faint text-[11.5px] text-center mt-4 leading-normal">A one-tap link, no password to remember.</p>}
        </div>
      </main>
    </>
  );
}
