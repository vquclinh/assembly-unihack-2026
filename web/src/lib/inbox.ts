"use client";

import type { Address } from "viem";
import { publicClient } from "./client";
import { ESCROW, escrowAbi } from "./config";
import { type Lease, Status } from "./lease";

export type MyLease = { id: bigint; lease: Lease };
export type MyLeases = { items: MyLease[]; landlord: Set<string>; tenant: Set<string>; mediator: Set<string>; credit: bigint };

/** Every lease where this address is the landlord, the tenant or the mediator, newest first. */
export async function loadMyLeases(address: Address): Promise<MyLeases> {
  const fns = ["leasesOfLandlord", "leasesOfTenant", "leasesOfMediator"] as const;
  const [ids, credit] = await Promise.all([
    Promise.all(fns.map((fn) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: fn, args: [address] }))) as Promise<bigint[][]>,
    publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "credit", args: [address] }) as Promise<bigint>,
  ]);
  const all = [...new Set(ids.flat().map((x) => x.toString()))].map(BigInt);
  const leases = (await Promise.all(
    all.map((id) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] })),
  )) as Lease[];
  const items = all.map((id, i) => ({ id, lease: leases[i] }));
  items.sort((a, b) => Number(b.id - a.id));
  const as = (n: number) => new Set(ids[n].map((x) => x.toString()));
  return { items, landlord: as(0), tenant: as(1), mediator: as(2), credit };
}

export type TodoKey = "sendReport" | "confirmMoveIn" | "answerNoShow" | "answerRelease" | "answerDeduction" | "rule" | "askRefund";
export type Todo = { id: bigint; lease: Lease; key: TodoKey; dueAt: number | null };

/**
 * What this address has to do on a lease right now, with the deadline after which the
 * contract decides without them. Mirrors the action panel on the lease page.
 */
export function todoFor(L: Lease, me: Address, now: number): { key: TodoKey; dueAt: number | null } | null {
  const is = (a: Address) => a.toLowerCase() === me.toLowerCase();
  const rw = Number(L.responseWindow);
  const moveIn = Number(L.moveInDeadline);
  const actionAt = Number(L.actionAt);
  const reported = L.conditionHash !== `0x${"0".repeat(64)}`;
  switch (L.status) {
    case Status.Reserved:
      if (now > moveIn + rw) return null;
      if (is(L.landlord) && !reported) return { key: "sendReport", dueAt: moveIn + rw };
      if (is(L.tenant) && reported) return { key: "confirmMoveIn", dueAt: moveIn + rw };
      return null;
    case Status.NoShowClaimed:
      return is(L.tenant) && now <= actionAt + rw ? { key: "answerNoShow", dueAt: actionAt + rw } : null;
    case Status.ReleaseRequested:
      return is(L.landlord) && now <= actionAt + rw ? { key: "answerRelease", dueAt: actionAt + rw } : null;
    case Status.SettlementProposed:
      return is(L.tenant) && now <= actionAt + rw ? { key: "answerDeduction", dueAt: actionAt + rw } : null;
    case Status.Disputed:
      return is(L.mediator) && now <= actionAt + Number(L.mediationTimeout) ? { key: "rule", dueAt: actionAt + Number(L.mediationTimeout) } : null;
    case Status.Active:
      return is(L.tenant) && now >= Number(L.leaseEnd) ? { key: "askRefund", dueAt: null } : null;
    default:
      return null;
  }
}

export function todos(data: MyLeases | null | undefined, me: Address | undefined, now: number): Todo[] {
  if (!data || !me) return [];
  const out: Todo[] = [];
  for (const it of data.items) {
    const t = todoFor(it.lease, me, now);
    if (t) out.push({ ...it, ...t });
  }
  return out.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
}
