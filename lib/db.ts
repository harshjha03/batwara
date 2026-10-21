import postgres from "postgres";
import { env } from "./env";

const g = globalThis as unknown as { sql?: postgres.Sql };

// prepare: false so it works through Supabase's transaction pooler.
// ssl: "require" — encrypted in transit even if the URL forgets sslmode.
// connect_timeout: an outage surfaces as a quick error, not a 30s hang per request.
// camel transform: snake_case columns <-> camelCase JS keys.
export const sql = g.sql ?? postgres(env("DATABASE_URL"), { prepare: false, ssl: "require", connect_timeout: 10, transform: postgres.camel });
if (process.env.NODE_ENV !== "production") g.sql = sql; // survive dev hot reloads

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export type Member = { id: string; userId: string | null; name: string };

/** Everyone in the group (ghosts have userId null), in join order. */
export async function groupMembers(groupId: string): Promise<Member[]> {
  if (!isUuid(groupId)) return [];
  return sql<Member[]>`select id, user_id, name from group_members where group_id = ${groupId} order by joined_at, name`;
}
