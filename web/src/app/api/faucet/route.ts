import { NextResponse } from "next/server";
import { type Address, isAddress, parseUnits } from "viem";
import { D, TOKEN, isDeployed, tokenAbi } from "@/lib/config";
import { decodeRevert, relayerWallet, serverPublic } from "@/lib/server";

export const runtime = "nodejs";

const AMOUNT = parseUnits("500", 6);
const CAP = parseUnits("2000", 6);

/** Hands out test USDC. Only works with the demo token, never with real USDC. */
export async function POST(req: Request) {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  if (!D.mockToken) return NextResponse.json({ error: "FaucetMockOnly" }, { status: 400 });
  const wallet = relayerWallet();
  if (!wallet) return NextResponse.json({ error: "NoRelayer" }, { status: 503 });
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "BadParams" }, { status: 400 });

  const balance = (await serverPublic.readContract({
    address: TOKEN,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
  if (balance >= CAP) return NextResponse.json({ error: "FaucetEnough" }, { status: 400 });

  try {
    const hash = await wallet.writeContract({
      address: TOKEN,
      abi: tokenAbi,
      functionName: "mint",
      args: [address as Address, AMOUNT],
    });
    await serverPublic.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, amount: AMOUNT.toString() });
  } catch (e) {
    const { code, detail } = decodeRevert(e);
    return NextResponse.json({ error: code ?? "FaucetFailed", detail }, { status: 500 });
  }
}
