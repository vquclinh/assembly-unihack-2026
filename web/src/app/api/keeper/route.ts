import { NextResponse } from "next/server";
import { isDeployed } from "@/lib/config";
import { runKeeper } from "@/lib/keeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled sweep over every lease (Vercel Cron calls this with the CRON_SECRET bearer token). */
export async function GET(req: Request) {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ results: await runKeeper() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

/**
 * Settles one lease if its deadline has passed. Public on purpose: `finalize` is
 * permissionless on-chain, and the keeper only acts when the contract would accept it.
 */
export async function POST(req: Request) {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  let id: bigint;
  try {
    const body = (await req.json()) as { id?: string };
    if (!body.id || !/^\d{1,12}$/.test(body.id)) throw new Error();
    id = BigInt(body.id);
  } catch {
    return NextResponse.json({ error: "BadParams" }, { status: 400 });
  }
  try {
    const results = await runKeeper([id]);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
