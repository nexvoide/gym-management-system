type Context = Record<string, string | number | boolean | null | undefined>;
const sensitive = /password|secret|token|authorization|cookie|database_url|key/i;

function safe(context: Context = {}) {
  return Object.fromEntries(Object.entries(context).filter(([key, value]) => !sensitive.test(key) && value !== undefined));
}

export const logger = {
  info(event: string, context?: Context) { console.info(JSON.stringify({ level: "info", event, ...safe(context) })); },
  warn(event: string, context?: Context) { console.warn(JSON.stringify({ level: "warn", event, ...safe(context) })); },
  error(event: string, error?: unknown, context?: Context) {
    console.error(JSON.stringify({ level: "error", event, error: error instanceof Error ? error.name : "UnknownError", ...safe(context) }));
  },
};
