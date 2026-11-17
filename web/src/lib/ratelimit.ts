import "server-only";
import { NextResponse } from "next/server";

/**
 * A small fixed-window limiter per client IP, kept in memory. It is per server instance, so
 * on a serverless host it is a speed bump against scripts emptying the relayer or faucet,
 * not a hard quota. Returns a 429 response when the caller should be refused.
 */
const hits = new Map<string, { n: number; reset: number }>();

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "local").trim();
}

export function rateLimit(req: Request, bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const cur = hits.get(key);
  if (!cur || now >= cur.reset) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    return null;
  }
  cur.n++;
  if (cur.n <= limit) return null;
  const retry = Math.ceil((cur.reset - now) / 1000);
  return NextResponse.json({ error: "RateLimited", detail: `${retry}s` }, { status: 429, headers: { "retry-after": String(retry) } });
}
