import { NextResponse } from "next/server";
import { type Abi, type Address, formatEther } from "viem";
import abis from "@/lib/abis.json";
import { OPEN_STATUSES, readAllLeases } from "@/lib/chain";
import { BADGE, D, ESCROW, FORWARDER, TOKEN, VAULT, hasBadge, isDeployed, tokenAbi } from "@/lib/config";
import { relayerWallet, serverPublic } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vaultAbi = abis.DemoYieldVault as Abi;

type Verification = { match: string | null; checkedAt: number };
const verified = new Map<string, Verification>();

/** Asks Sourcify whether the deployed bytecode matches the published source. Cached for 10 minutes. */
async function sourcify(address: string): Promise<string | null> {
  const hit = verified.get(address);
  if (hit && Date.now() - hit.checkedAt < 10 * 60_000) return hit.match;
  try {
    const res = await fetch(`https://sourcify.dev/server/v2/contract/${D.chainId}/${address}`, {
      headers: { "user-agent": "coc-transparency/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    const json = res.ok ? ((await res.json()) as { match?: string | null }) : null;
    const match = json?.match ?? null;
    verified.set(address, { match, checkedAt: Date.now() });
    return match;
  } catch {
    return hit?.match ?? null;
  }
}

/**
 * Everything someone needs to check Coc without trusting us: contract addresses and their
 * verified source, and a live solvency check computed from chain state only.
 */
export async function GET() {
  if (!isDeployed) return NextResponse.json({ error: "NotDeployed" }, { status: 503 });
  try {
    const relayer = relayerWallet()?.account.address ?? null;
    const [block, { leases }, held, shares, relayerBalance, relayerTxs] = await Promise.all([
      serverPublic.getBlock({ blockTag: "latest" }),
      readAllLeases(8000),
      serverPublic.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [ESCROW] }) as Promise<bigint>,
      serverPublic.readContract({ address: VAULT, abi: vaultAbi, functionName: "balanceOf", args: [ESCROW] }) as Promise<bigint>,
      relayer ? serverPublic.getBalance({ address: relayer }) : Promise.resolve(null),
      relayer ? serverPublic.getTransactionCount({ address: relayer }) : Promise.resolve(null),
    ]);
    const inVault = shares > 0n ? ((await serverPublic.readContract({ address: VAULT, abi: vaultAbi, functionName: "convertToAssets", args: [shares] })) as bigint) : 0n;
    const open = leases.filter((l) => OPEN_STATUSES.includes(l.status));
    const locked = open.reduce((a, l) => a + l.balance, 0n);

    const list: { name: string; address: Address; role: string }[] = [
      { name: "CocEscrow", address: ESCROW, role: "escrow" },
      { name: "CocForwarder", address: FORWARDER, role: "forwarder" },
      { name: D.mockToken ? "MockUSDC" : "USDC", address: TOKEN, role: "token" },
      { name: "DemoYieldVault", address: VAULT, role: "vault" },
      ...(hasBadge ? [{ name: "CocBadge", address: BADGE, role: "badge" }] : []),
    ];
    const contracts = await Promise.all(
      list.map(async (c) => {
        const [code, match] = await Promise.all([serverPublic.getCode({ address: c.address }), sourcify(c.address)]);
        return { ...c, deployed: !!code && code !== "0x", codeSize: code ? (code.length - 2) / 2 : 0, match };
      }),
    );

    return NextResponse.json({
      network: D.network,
      chainId: D.chainId,
      block: { number: block.number.toString(), timestamp: Number(block.timestamp) },
      contracts,
      solvency: {
        held: (held + inVault).toString(),
        inEscrow: held.toString(),
        inVault: inVault.toString(),
        locked: locked.toString(),
        openLeases: open.length,
        totalLeases: leases.length,
        solvent: held + inVault >= locked,
      },
      relayer: relayer
        ? { address: relayer, avax: relayerBalance !== null ? formatEther(relayerBalance) : null, txs: relayerTxs }
        : null,
      defaults: { responseWindow: D.responseWindow, mediationTimeout: D.mediationTimeout },
    });
  } catch (e) {
    return NextResponse.json({ error: "ReadFailed", detail: (e as Error).message }, { status: 503 });
  }
}
