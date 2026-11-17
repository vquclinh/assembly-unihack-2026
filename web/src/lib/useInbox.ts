"use client";

import { isDeployed } from "./config";
import { usePoll } from "./hooks";
import { loadMyLeases } from "./inbox";
import { useWallet } from "./wallet";

/** The active wallet's leases, polled. Shared by the header badge and the "My leases" page. */
export function useMyLeases(intervalMs = 15000) {
  const w = useWallet();
  const me = w.active?.address;
  // Pages inside the judge demo never show the header, so they skip this poll.
  const embedded = typeof document !== "undefined" && document.documentElement.dataset.embed === "1";
  return { me, ...usePoll(async () => (isDeployed && me && !(embedded && intervalMs > 10000) ? loadMyLeases(me) : null), [me], intervalMs) };
}
