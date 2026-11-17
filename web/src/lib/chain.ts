import "server-only";
import type { Address } from "viem";
import { ESCROW, escrowAbi, isDeployed } from "./config";
import { type Lease, type Stats, Status, toStats } from "./lease";
import { serverPublic } from "./server";

export type IndexedLease = Lease & { id: string };

let cache: { at: number; leases: IndexedLease[]; chainTime: number } | null = null;

/** Reads every lease from the escrow. Results are cached for a few seconds. */
export async function readAllLeases(maxAgeMs = 5000) {
  if (!isDeployed) return { leases: [] as IndexedLease[], chainTime: Math.floor(Date.now() / 1000) };
  if (cache && Date.now() - cache.at < maxAgeMs) return cache;
  const [count, block] = await Promise.all([
    serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "leaseCount" }) as Promise<bigint>,
    serverPublic.getBlock({ blockTag: "latest" }),
  ]);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const leases: IndexedLease[] = [];
  // Read in chunks so a busy deployment does not open thousands of requests at once.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await Promise.all(
      chunk.map((id) => serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] }) as Promise<Lease>),
    );
    rows.forEach((l, j) => leases.push({ ...l, id: chunk[j].toString() }));
  }
  cache = { at: Date.now(), leases, chainTime: Number(block.timestamp) };
  return cache;
}

export async function readLease(id: bigint) {
  return (await serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] })) as Lease;
}

export async function readLandlordStats(addresses: Address[]) {
  const rows = await Promise.all(
    addresses.map((a) => serverPublic.readContract({ address: ESCROW, abi: escrowAbi, functionName: "landlordStats", args: [a] })),
  );
  const out = new Map<string, Stats>();
  rows.forEach((r, i) => out.set(addresses[i].toLowerCase(), toStats(r as readonly unknown[])));
  return out;
}

export const OPEN_STATUSES: number[] = [Status.Reserved, Status.Active, Status.ReleaseRequested, Status.SettlementProposed, Status.NoShowClaimed, Status.Disputed];
