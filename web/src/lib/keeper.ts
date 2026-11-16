import "server-only";
import type { Hex } from "viem";
import { ESCROW, escrowAbi } from "./config";
import { readAllLeases, readLease, windows } from "./chain";
import { finalizeDueAt } from "./lease";
import { decodeRevert, relayerWallet, serverPublic } from "./server";

export type KeeperResult = { id: string; ok: boolean; tx?: Hex; error?: string };

/**
 * The keeper settles leases whose deadline has passed by calling `finalize`, which anyone
 * may do. It pays the gas from the relayer wallet, so nobody has to come back and press a
 * button for an expired deadline to take effect.
 */
export async function runKeeper(only?: bigint[]): Promise<KeeperResult[]> {
  const wallet = relayerWallet();
  if (!wallet) throw new Error("NoRelayer");
  const block = await serverPublic.getBlock({ blockTag: "latest" });
  const now = Number(block.timestamp);

  const candidates = only
    ? await Promise.all(only.map(async (id) => ({ ...(await readLease(id)), id: id.toString() })))
    : (await readAllLeases(0)).leases;

  const due = candidates.filter((L) => {
    const at = finalizeDueAt(L, windows.responseWindow, windows.mediationTimeout);
    return at !== null && now >= at;
  });

  const results: KeeperResult[] = [];
  for (const L of due) {
    try {
      const { request } = await serverPublic.simulateContract({
        account: wallet.account,
        address: ESCROW,
        abi: escrowAbi,
        functionName: "finalize",
        args: [BigInt(L.id)],
      });
      const tx = await wallet.writeContract(request);
      const receipt = await serverPublic.waitForTransactionReceipt({ hash: tx });
      results.push({ id: L.id, ok: receipt.status === "success", tx });
    } catch (e) {
      const { code, detail } = decodeRevert(e);
      results.push({ id: L.id, ok: false, error: code ?? detail });
    }
  }
  return results;
}
