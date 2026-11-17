import { NextResponse } from "next/server";
import { isDeployed } from "@/lib/config";
import { leaseHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The full on-chain history of one lease, from the offer to the last payment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "BadParams" }, { status: 400 });
  try {
    return NextResponse.json({ events: await leaseHistory(BigInt(id), new URL(req.url).searchParams.get("fresh") === "1") });
  } catch (e) {
    return NextResponse.json({ error: "ReadFailed", detail: (e as Error).message }, { status: 503 });
  }
}
