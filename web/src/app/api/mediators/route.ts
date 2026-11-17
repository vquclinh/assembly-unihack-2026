import { NextResponse } from "next/server";
import type { Address } from "viem";
import { readAllLeases } from "@/lib/chain";
import { ESCROW, escrowAbi, isDeployed } from "@/lib/config";
import { serverPublic } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every mediator named on a lease, with the record the contract keeps for them. */
export async function GET() {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  try {
    const { leases } = await readAllLeases(8000);
    const count = new Map<string, { address: Address; leases: number }>();
    for (const l of leases) {
      const k = l.mediator.toLowerCase();
      const c = count.get(k) ?? { address: l.mediator, leases: 0 };
      c.leases++;
      count.set(k, c);
    }
    const rows = await Promise.all(
      [...count.values()].map(async (m) => {
        const [resolved, timedOut] = await Promise.all([
          serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorResolved", args: [m.address] }),
          serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorTimedOut", args: [m.address] }),
        ]);
        return { ...m, resolved: Number(resolved), timedOut: Number(timedOut) };
      }),
    );
    // Most cases handled first; someone who let cases time out sinks.
    rows.sort((a, b) => b.resolved - b.timedOut * 3 - (a.resolved - a.timedOut * 3) || b.leases - a.leases);
    return NextResponse.json({ mediators: rows.slice(0, 12) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
