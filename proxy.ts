import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out users to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const sb = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await sb.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && !path.startsWith("/login") && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|svg|ico|webmanifest|js|html)$).*)"],
};
