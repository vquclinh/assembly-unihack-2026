import { NextResponse } from "next/server";
import { type Address, type Hex, concat, getAddress, isAddress, isHex } from "viem";
import { BADGE, ESCROW, FORWARDER, forwarderAbi, hasBadge, isDeployed } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { decodeRevert, relayerWallet, relayerWriteAndWait, serverPublic } from "@/lib/server";

export const runtime = "nodejs";

type Body = {
  request: { from: string; to: string; value: string; gas: string; nonce: string; deadline: number; data: string };
  signature: string;
};

export async function POST(req: Request) {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  if (!relayerWallet()) return NextResponse.json({ error: "NoRelayer" }, { status: 503 });
  const limited = rateLimit(req, "relay", 40, 60_000);
  if (limited) return limited;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "BadParams" }, { status: 400 });
  }
  const r = body.request;
  if (!r || !isAddress(r.from) || !isAddress(r.to) || !isHex(r.data) || !isHex(body.signature)) {
    return NextResponse.json({ error: "BadParams" }, { status: 400 });
  }
  // The relayer only pays gas for calls into Tinco's own contracts, never for arbitrary ones.
  const allowed = [getAddress(ESCROW), ...(hasBadge ? [getAddress(BADGE)] : [])];
  if (!allowed.includes(getAddress(r.to)) || r.value !== "0") {
    return NextResponse.json({ error: "NotAllowed" }, { status: 400 });
  }
  const gas = BigInt(r.gas);
  if (gas > 2_000_000n) return NextResponse.json({ error: "BadParams" }, { status: 400 });

  const request = {
    from: r.from as Address,
    to: r.to as Address,
    value: 0n,
    gas,
    deadline: Number(r.deadline),
    data: r.data as Hex,
    signature: body.signature as Hex,
  };

  const valid = (await serverPublic.readContract({
    address: FORWARDER,
    abi: forwarderAbi,
    functionName: "verify",
    args: [request],
  })) as boolean;
  if (!valid) return NextResponse.json({ error: "BadSignature" }, { status: 400 });

  // Dry-run the inner call exactly as the forwarder will make it, to return a readable error.
  try {
    await serverPublic.call({ account: FORWARDER, to: request.to, data: concat([request.data, request.from]), gas });
  } catch (e) {
    const { code, detail } = decodeRevert(e);
    return NextResponse.json({ error: code ?? "Reverted", detail }, { status: 400 });
  }

  try {
    const { hash, receipt, ms, fee } = await relayerWriteAndWait({
      address: FORWARDER,
      abi: forwarderAbi,
      functionName: "execute",
      args: [request],
      gas: gas + 400_000n,
    });
    if (receipt.status !== "success") return NextResponse.json({ error: "Reverted", detail: hash }, { status: 500 });
    return NextResponse.json({ hash, ms, fee, block: receipt.blockNumber.toString() });
  } catch (e) {
    const { code, detail } = decodeRevert(e);
    return NextResponse.json({ error: code ?? "RelayFailed", detail }, { status: 500 });
  }
}
