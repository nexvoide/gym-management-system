import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { validateServerEnvironment } from "@/lib/env";

validateServerEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
  throw new Error("DATABASE_URL must be an explicit PostgreSQL connection string.");
}

export const client = postgres(databaseUrl, {
  prepare: false,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});

export const db = drizzle(client, { schema });
