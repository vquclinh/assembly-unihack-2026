import { NextResponse } from "next/server";
import { type Address, zeroAddress } from "viem";
import { OPEN_STATUSES, readAllLeases, readLandlordStats } from "@/lib/chain";
import { ESCROW, escrowAbi, isDeployed } from "@/lib/config";
import { Status } from "@/lib/lease";
import { serverPublic } from "@/lib/server";
import { getFile } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function termsTitle(hash: string) {
  const f = await getFile(hash);
  if (!f) return null;
  try {
    return (JSON.parse(f.bytes.toString("utf8")) as { title?: string }).title ?? null;
  } catch {
    return null;
  }
}

/** Protocol-wide numbers, computed from contract state only (no off-chain database). */
export async function GET() {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  try {
    const { leases, chainTime } = await readAllLeases(8000);
    const landlords = [...new Set(leases.map((l) => l.landlord.toLowerCase()))] as Address[];
    const tenants = [...new Set(leases.filter((l) => l.tenant !== zeroAddress).map((l) => l.tenant.toLowerCase()))] as Address[];
    const mediators = [...new Set(leases.map((l) => l.mediator.toLowerCase()))] as Address[];

    const [lStats, tStats, mResolved, mTimedOut] = await Promise.all([
      readLandlordStats(landlords),
      Promise.all(tenants.map((a) => serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "tenantStats", args: [a] }))),
      Promise.all(mediators.map((a) => serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorResolved", args: [a] }))),
      Promise.all(mediators.map((a) => serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorTimedOut", args: [a] }))),
    ]);

    const sum = (k: "completed" | "amicable" | "disputes" | "disputesLost" | "timeouts" | "ghosted") =>
      [...lStats.values()].reduce((a, s) => a + s[k], 0);
    const tenantNoShows = tStats.reduce((a: number, r) => a + Number((r as readonly unknown[])[5]), 0);

    const byStatus: Record<number, number> = {};
    for (const l of leases) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;

    const lockedNow = leases.filter((l) => OPEN_STATUSES.includes(l.status)).reduce((a, l) => a + l.balance, 0n);
    const secured = leases.reduce(
      (a, l) => a + (l.activatedAt > 0n ? l.depositAmount : l.tenant !== zeroAddress && l.status !== Status.Offered ? l.holdAmount : 0n),
      0n,
    );
    const completed = sum("completed");
    const amicable = sum("amicable");

    const recent = await Promise.all(
      [...leases]
        .reverse()
        .slice(0, 8)
        .map(async (l) => ({
          id: l.id,
          status: l.status,
          deposit: l.depositAmount.toString(),
          title: await termsTitle(l.termsHash),
        })),
    );

    return NextResponse.json(
      {
        chainTime,
        leases: leases.length,
        reserved: leases.filter((l) => l.tenant !== zeroAddress && l.status !== Status.Offered).length,
        openOffers: leases.filter((l) => l.status === Status.Offered && Number(l.moveInDeadline) > chainTime).length,
        lockedNow: lockedNow.toString(),
        secured: secured.toString(),
        landlords: landlords.length,
        tenants: tenants.length,
        completed,
        amicable,
        amicableRate: completed ? amicable / completed : null,
        disputes: sum("disputes"),
        mediatorRulings: mResolved.reduce((a: number, r) => a + Number(r), 0),
        mediatorTimeouts: mTimedOut.reduce((a: number, r) => a + Number(r), 0),
        landlordTimeouts: sum("timeouts"),
        fakeLandlordRefunds: sum("ghosted"),
        tenantNoShows,
        byStatus,
        recent,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
