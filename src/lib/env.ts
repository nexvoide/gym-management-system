const serverRequired = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

export function validateServerEnvironment() {
  const required = process.env.NODE_ENV === "production" ? [...serverRequired, "APP_URL"] : serverRequired;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required server configuration: ${missing.join(", ")}`);
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL!)) throw new Error("DATABASE_URL must use PostgreSQL.");
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1|\.tmp\/|\.sqlite|gym\.db/i.test(process.env.DATABASE_URL!)) {
    throw new Error("Production cannot use a local or SQLite database.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("https://")) throw new Error("Production APP_URL must use HTTPS.");
}
