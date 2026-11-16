"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { publicClient } from "./client";
import { ESCROW, TOKEN, escrowAbi, isDeployed, tokenAbi } from "./config";
import { type Lease, type Stats, toStats } from "./lease";

/** Polls a value. `refresh` forces an immediate reload (call it after a transaction). */
export function usePoll<T>(fn: () => Promise<T>, deps: unknown[], intervalMs = 4000) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(undefined);
    } catch (e) {
      setError(e as Error);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await refresh();
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, refresh };
}

export type LeaseSnapshot = { lease: Lease; value: bigint; chainTime: number; fetchedAt: number };

export function useLease(id: bigint | null) {
  return usePoll<LeaseSnapshot | null>(
    async () => {
      if (!isDeployed || id === null) return null;
      const [lease, value, block] = await Promise.all([
        publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] }) as Promise<Lease>,
        publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "currentValue", args: [id] }) as Promise<bigint>,
        publicClient.getBlock({ blockTag: "latest" }),
      ]);
      return { lease, value, chainTime: Number(block.timestamp), fetchedAt: Date.now() };
    },
    [id?.toString()],
  );
}

export function useBalance(address?: Address) {
  return usePoll<bigint>(
    async () => {
      if (!isDeployed || !address) return 0n;
      return (await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [address] })) as bigint;
    },
    [address],
    6000,
  );
}

export async function readStats(address: Address) {
  const [landlord, tenant, resolved, timedOut] = await Promise.all([
    publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "landlordStats", args: [address] }),
    publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "tenantStats", args: [address] }),
    publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorResolved", args: [address] }),
    publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "mediatorTimedOut", args: [address] }),
  ]);
  return {
    landlord: toStats(landlord as readonly unknown[]),
    tenant: toStats(tenant as readonly unknown[]),
    mediatorResolved: Number(resolved),
    mediatorTimedOut: Number(timedOut),
  };
}

export function useStats(address?: Address) {
  return usePoll<Awaited<ReturnType<typeof readStats>> | null>(
    async () => (isDeployed && address ? readStats(address) : null),
    [address],
    10000,
  );
}

export type { Stats };

/** A clock that follows chain time between polls. */
export function useChainClock(chainTime?: number, fetchedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (chainTime === undefined || fetchedAt === undefined) return Math.floor(now / 1000);
  return chainTime + Math.floor((now - fetchedAt) / 1000);
}
