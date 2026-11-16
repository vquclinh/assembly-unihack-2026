import { NextResponse } from "next/server";
import { type Address, zeroAddress } from "viem";
import { readAllLeases, readLandlordStats } from "@/lib/chain";
import { BADGE, badgeAbi, hasBadge, isDeployed } from "@/lib/config";
import { type Terms, Status } from "@/lib/lease";
import type { ScamReport } from "@/lib/reports";
import { serverPublic } from "@/lib/server";
import { getFile, listRecords } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readTerms(hash: string): Promise<Terms | null> {
  const f = await getFile(hash);
  if (!f) return null;
  try {
    const t = JSON.parse(f.bytes.toString("utf8")) as Terms;
    return t.kind === "terms" ? t : null;
  } catch {
    return null;
  }
}

/**
 * Open deposit links that their landlord chose to list publicly. Everything that decides
 * trust (status, amounts, deadlines, track record, badge) comes from the chain.
 */
export async function GET() {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  try {
    const { leases, chainTime } = await readAllLeases(8000);
    const open = leases.filter((l) => l.status === Status.Offered && l.tenant === zeroAddress && Number(l.moveInDeadline) > chainTime);
    const withTerms = (await Promise.all(open.map(async (l) => ({ l, terms: await readTerms(l.termsHash) })))).filter((x) => x.terms?.listed);

    const landlords = [...new Set(withTerms.map((x) => x.l.landlord))] as Address[];
    const [stats, trusted, reports] = await Promise.all([
      readLandlordStats(landlords),
      Promise.all(
        landlords.map((a) =>
          hasBadge ? (serverPublic.readContract({ address: BADGE, abi: badgeAbi, functionName: "isTrusted", args: [a] }) as Promise<boolean>) : false,
        ),
      ),
      listRecords<ScamReport>("reports"),
    ]);
    const trustedMap = new Map(landlords.map((a, i) => [a.toLowerCase(), trusted[i]]));
    const reportCount = new Map<string, number>();
    for (const r of reports) reportCount.set(r.landlord.toLowerCase(), (reportCount.get(r.landlord.toLowerCase()) ?? 0) + 1);

    const rooms = withTerms
      .map(({ l, terms }) => {
        const s = stats.get(l.landlord.toLowerCase())!;
        return {
          id: l.id,
          landlord: l.landlord,
          hold: l.holdAmount.toString(),
          deposit: l.depositAmount.toString(),
          moveInDeadline: Number(l.moveInDeadline),
          yieldOptIn: l.landlordYieldOptIn,
          title: terms!.title,
          address: terms!.address,
          rentVnd: terms!.rentVnd,
          depositVnd: terms!.depositVnd,
          holdVnd: terms!.holdVnd,
          notes: terms!.notes,
          photos: terms!.photos ?? [],
          createdAt: terms!.createdAt,
          stats: { ...s, valueSeconds: s.valueSeconds.toString() },
          trusted: trustedMap.get(l.landlord.toLowerCase()) ?? false,
          reports: reportCount.get(l.landlord.toLowerCase()) ?? 0,
        };
      })
      .sort((a, b) => Number(b.id) - Number(a.id));

    return NextResponse.json({ chainTime, rooms }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
