import { NextResponse } from "next/server";
import { type Address, type Hex, getAddress, isAddress, isHex, verifyTypedData } from "viem";
import { REPORT_DOMAIN, REPORT_REASONS, REPORT_TYPES, type ScamReport } from "@/lib/reports";
import { listRecords, putRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public view of a report: the signature stays server-side. */
function view(r: ScamReport) {
  return { landlord: r.landlord, reporter: r.reporter, leaseId: r.leaseId, reason: r.reason, note: r.note, timestamp: r.timestamp };
}

export async function GET(req: Request) {
  const landlord = new URL(req.url).searchParams.get("landlord");
  const all = await listRecords<ScamReport>("reports");
  const rows = landlord && isAddress(landlord) ? all.filter((r) => r.landlord.toLowerCase() === landlord.toLowerCase()) : all;
  rows.sort((a, b) => b.timestamp - a.timestamp);
  return NextResponse.json({ count: rows.length, reports: rows.slice(0, 50).map(view) });
}

export async function POST(req: Request) {
  let body: Partial<ScamReport>;
  try {
    body = (await req.json()) as Partial<ScamReport>;
  } catch {
    return NextResponse.json({ error: "BadParams" }, { status: 400 });
  }
  const { landlord, reporter, leaseId, reason, note, timestamp, signature } = body;
  if (
    !landlord || !isAddress(landlord) || !reporter || !isAddress(reporter) ||
    !leaseId || !/^\d{1,12}$/.test(leaseId) || !reason || !REPORT_REASONS.includes(reason) ||
    typeof note !== "string" || note.length > 280 || typeof timestamp !== "number" || !signature || !isHex(signature)
  ) {
    return NextResponse.json({ error: "BadParams" }, { status: 400 });
  }
  if (getAddress(landlord) === getAddress(reporter)) return NextResponse.json({ error: "NotAllowed" }, { status: 400 });
  if (Math.abs(Date.now() / 1000 - timestamp) > 600) return NextResponse.json({ error: "TooLate" }, { status: 400 });

  const ok = await verifyTypedData({
    address: reporter as Address,
    domain: REPORT_DOMAIN,
    types: REPORT_TYPES,
    primaryType: "ScamReport",
    message: { landlord: landlord as Address, leaseId: BigInt(leaseId), reason, note, timestamp: BigInt(timestamp) },
    signature: signature as Hex,
  });
  if (!ok) return NextResponse.json({ error: "BadSignature" }, { status: 400 });

  const record: ScamReport = {
    landlord: getAddress(landlord),
    reporter: getAddress(reporter),
    leaseId,
    reason,
    note: note.trim(),
    timestamp,
    signature: signature as Hex,
  };
  // One report per wallet per landlord: a new report replaces the old one.
  await putRecord("reports", `${record.landlord.toLowerCase()}-${record.reporter.toLowerCase()}`, record);
  return NextResponse.json({ ok: true });
}
