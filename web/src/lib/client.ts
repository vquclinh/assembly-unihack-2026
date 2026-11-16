import { createPublicClient, http } from "viem";
import { chain } from "./config";

/**
 * In the browser, reads go through our own /api/rpc proxy: the public Fuji RPC rate-limits
 * per IP and its 429 replies have no CORS headers, which the browser reports as a bare
 * "NetworkError". The proxy dedupes and retries. On the server, talk to the RPC directly.
 */
const transport =
  typeof window === "undefined" ? http() : http("/api/rpc", { batch: { wait: 30 }, retryCount: 4, retryDelay: 400 });

export const publicClient = createPublicClient({ chain, transport });

/** Chain time, which is what the contract's deadlines are measured against. */
export async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}
