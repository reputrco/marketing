import { NextRequest } from "next/server";

// Guard for the push API. Returns null if authorized, else an error message.
export function checkBearer(req: NextRequest): string | null {
  const expected = process.env.PORTAL_API_TOKEN;
  if (!expected) return "PORTAL_API_TOKEN not configured on server";

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== expected) return "Unauthorized";

  return null;
}
