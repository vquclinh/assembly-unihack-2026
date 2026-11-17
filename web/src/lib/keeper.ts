import "server-only";
import type { Hex } from "viem";
import { ESCROW, escrowAbi } from "./config";
import { readAllLeases, readLease } from "./chain";
import { finalizeDueAt } from "./lease";
import { decodeRevert, relayerWallet, relayerWriteAndWait, serverPublic } from "./server";

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
  // When the chain is idle the latest block can be old; the finalize transaction will be
  // mined in a new block stamped with the current time, so use whichever is later.
  const now = Math.max(Number(block.timestamp), Math.floor(Date.now() / 1000) - 2);

  const candidates = only
    ? await Promise.all(only.map(async (id) => ({ ...(await readLease(id)), id: id.toString() })))
    : (await readAllLeases(0)).leases;

  const due = candidates.filter((L) => {
    const at = finalizeDueAt(L);
    return at !== null && now >= at;
  });

  const results: KeeperResult[] = [];
  for (const L of due) {
    try {
      let gas = 400_000n;
      try {
        const { request } = await serverPublic.simulateContract({
          account: wallet.account,
          address: ESCROW,
          abi: escrowAbi,
          functionName: "finalize",
          args: [BigInt(L.id)],
        });
        if (request.gas) gas = request.gas;
      } catch (e) {
        // The dry run uses the latest block's time, which lags on an idle chain. Only a
        // TooEarly from that stale clock is worth sending anyway; anything else is real.
        if (decodeRevert(e).code !== "TooEarly") throw e;
      }
      const { hash: tx, receipt } = await relayerWriteAndWait({ address: ESCROW, abi: escrowAbi, functionName: "finalize", args: [BigInt(L.id)], gas });
      results.push({ id: L.id, ok: receipt.status === "success", tx });
    } catch (e) {
      const { code, detail } = decodeRevert(e);
      results.push({ id: L.id, ok: false, error: code ?? detail });
    }
  }
  return results;
}
