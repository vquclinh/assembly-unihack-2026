import { NextResponse } from "next/server";
import { type Address, type Hex, formatUnits, keccak256, toBytes, zeroHash } from "viem";
import { aiConfigured, assessDamage } from "@/lib/ai";
import { readLease } from "@/lib/chain";
import { isDeployed } from "@/lib/config";
import { type AiReport, type ConditionReport, type Evidence, type Lease, Status } from "@/lib/lease";
import { getFile, getRecord, putFile, putRecord } from "@/lib/store";
import { paymentRequiredBody, paymentResponseHeader, requirements, settlePayment, verifyPayment } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function doc<T>(hash: Hex): Promise<T | null> {
  if (hash === zeroHash) return null;
  const f = await getFile(hash);
  if (!f) return null;
  try {
    return JSON.parse(f.bytes.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** One report per lease per set of evidence: new evidence means a new report. */
function recordId(id: string, L: Lease) {
  return `${id}-${keccak256(toBytes(`${L.conditionHash}${L.landlordEvidence}${L.tenantEvidence}`)).slice(2, 18)}`;
}

async function context(idParam: string) {
  if (!isDeployed) return { error: NextResponse.json({ error: "NotDeployed" }, { status: 503 }) };
  if (!/^\d{1,12}$/.test(idParam)) return { error: NextResponse.json({ error: "BadParams" }, { status: 400 }) };
  const L = await readLease(BigInt(idParam));
  if (L.conditionHash === zeroHash || L.landlordEvidence === zeroHash) {
    return { error: NextResponse.json({ error: "AiNoEvidence" }, { status: 409 }) };
  }
  return { L, rid: recordId(idParam, L) };
}

/** Returns the report if someone already paid for it, otherwise the x402 payment requirements. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await context(id);
  if ("error" in c) return c.error;
  const existing = await getRecord<AiReport>("ai-reports", c.rid);
  if (existing) return NextResponse.json({ report: existing });
  if (!aiConfigured()) return NextResponse.json({ error: "AiNotConfigured" }, { status: 503 });
  const url = new URL(req.url);
  const r = await requirements(url.origin + url.pathname, `AI damage assessment for Coc lease #${id}`);
  if (!r) return NextResponse.json({ error: "NoRelayer" }, { status: 503 });
  // Plain GET answers 402 as x402 clients expect. Our own UI polls with ?quote=1 and gets the
  // same body with 200, so the browser console does not fill with "402" errors.
  return NextResponse.json(paymentRequiredBody(r), { status: url.searchParams.get("quote") === "1" ? 200 : 402 });
}

/** Pays with X-PAYMENT, runs the assessment, settles the USDC on Avalanche, stores the report. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await context(id);
  if ("error" in c) return c.error;
  const { L, rid } = c;
  const existing = await getRecord<AiReport>("ai-reports", rid);
  if (existing) return NextResponse.json({ report: existing });
  if (!aiConfigured()) return NextResponse.json({ error: "AiNotConfigured" }, { status: 503 });
  if (![Status.SettlementProposed, Status.Disputed, Status.Closed].includes(L.status as 5 | 7 | 8)) {
    return NextResponse.json({ error: "WrongStatus" }, { status: 409 });
  }

  const url = new URL(req.url);
  const r = await requirements(url.origin + url.pathname, `AI damage assessment for Coc lease #${id}`);
  if (!r) return NextResponse.json({ error: "NoRelayer" }, { status: 503 });

  let payment;
  try {
    payment = await verifyPayment(req.headers.get("x-payment"), r);
  } catch (e) {
    return NextResponse.json(paymentRequiredBody(r, (e as Error).message), { status: 402 });
  }

  const body = (await req.json().catch(() => ({}))) as { lang?: string };
  const [condition, landlord, tenant] = await Promise.all([
    doc<ConditionReport>(L.conditionHash),
    doc<Evidence>(L.landlordEvidence),
    doc<Evidence>(L.tenantEvidence),
  ]);
  if (!condition || !landlord) return NextResponse.json({ error: "AiNoEvidence" }, { status: 409 });

  const contested = L.status === Status.Disputed ? L.disputedAmount : L.proposedDeduction;
  let result;
  try {
    // The assessment runs before settlement, so nobody pays for a failed report.
    result = await assessDamage({
      leaseId: id,
      condition,
      landlord,
      tenant,
      contestedUsdc: formatUnits(contested, 6),
      lang: body.lang === "vi" ? "vi" : "en",
    });
  } catch (e) {
    console.error(`[ai-report] lease ${id}: ${(e as Error).message}`);
    return NextResponse.json({ error: "AiFailed", detail: (e as Error).message }, { status: 502 });
  }

  let tx: Hex;
  try {
    tx = await settlePayment(payment);
  } catch (e) {
    return NextResponse.json(paymentRequiredBody(r, (e as Error).message), { status: 402 });
  }

  const report: AiReport = {
    kind: "ai-report",
    v: 1,
    leaseId: id,
    ...result,
    inputs: { condition: L.conditionHash, landlordEvidence: L.landlordEvidence, tenantEvidence: L.tenantEvidence },
    payment: { payer: payment.auth.from as Address, amount: payment.auth.value, tx },
    createdAt: new Date().toISOString(),
  };
  const bytes = toBytes(JSON.stringify(report));
  await putFile(keccak256(bytes), bytes, "application/json");
  await putRecord("ai-reports", rid, report);
  return NextResponse.json({ report }, { headers: { "x-payment-response": paymentResponseHeader(tx, payment.auth.from as Address) } });
}
