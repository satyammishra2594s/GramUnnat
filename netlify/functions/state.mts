import { appStates } from "../../db/schema.js";
import { db } from "../../db/index.js";
import { eq } from "drizzle-orm";

const headers = { "Cache-Control": "no-store" };

function validUserKey(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export default async (request: Request) => {
  const userKey = request.headers.get("x-gramunnat-user");
  if (!validUserKey(userKey)) {
    return Response.json({ error: "A valid user key is required." }, { status: 400, headers });
  }

  if (request.method === "GET") {
    const [row] = await db.select().from(appStates).where(eq(appStates.userKey, userKey)).limit(1);
    return Response.json({ data: row?.data ?? null, updatedAt: row?.updatedAt ?? null }, { headers });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => null) as { data?: unknown } | null;
    const serialized = JSON.stringify(body?.data ?? null);
    if (!body || typeof body.data !== "object" || serialized.length > 900_000) {
      return Response.json({ error: "Invalid or oversized state." }, { status: 400, headers });
    }

    const [row] = await db.insert(appStates).values({ userKey, data: body.data as object, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appStates.userKey,
        set: { data: body.data as object, updatedAt: new Date() },
      })
      .returning({ updatedAt: appStates.updatedAt });
    return Response.json({ ok: true, updatedAt: row.updatedAt }, { headers });
  }

  return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET, PUT" } });
};

export const config = { path: "/api/state" };
