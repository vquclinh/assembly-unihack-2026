import { createPublicClient, http } from "viem";
import { chain } from "./config";

export const publicClient = createPublicClient({ chain, transport: http() });

/** Chain time, which is what the contract's deadlines are measured against. */
export async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}
