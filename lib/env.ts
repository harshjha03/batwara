/** Fail fast with a clear message instead of silently targeting localhost / empty keys. */
export const env = (k: "DATABASE_URL" | "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY") => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required environment variable ${k}`);
  return v;
};

/** Supabase auth cookie flags: Secure in production, Lax, site-wide. */
export const cookieOptions = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
