const serverRequired = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

export function validateServerEnvironment() {
  const missing = serverRequired.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required server configuration: ${missing.join(", ")}`);
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL!)) throw new Error("DATABASE_URL must use PostgreSQL.");
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1|\.tmp\/|\.sqlite|gym\.db/i.test(process.env.DATABASE_URL!)) {
    throw new Error("Production cannot use a local or SQLite database.");
  }
}

export function requireAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required for authentication email redirects.");
  if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) throw new Error("Production APP_URL must use HTTPS.");
  return appUrl.replace(/\/$/, "");
}
