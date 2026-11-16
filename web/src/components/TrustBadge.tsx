"use client";

import type { Address } from "viem";
import { useState } from "react";
import { publicClient } from "@/lib/client";
import { BADGE, D, badgeAbi, explorerAddress, hasBadge } from "@/lib/config";
import { errorText } from "@/lib/errors";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { relayBadgeClaim, relayCallRaw } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { Button, Card, cx } from "./ui";

type TrustInfo = { tokenId: bigint; eligible: boolean; trusted: boolean; minCompleted: number; image: string | null };

async function readTrust(address: Address): Promise<TrustInfo | null> {
  if (!hasBadge) return null;
  const [tokenId, eligible, trusted, minCompleted] = await Promise.all([
    publicClient.readContract({ address: BADGE, abi: badgeAbi, functionName: "badgeOf", args: [address] }) as Promise<bigint>,
    publicClient.readContract({ address: BADGE, abi: badgeAbi, functionName: "eligible", args: [address] }) as Promise<boolean>,
    publicClient.readContract({ address: BADGE, abi: badgeAbi, functionName: "isTrusted", args: [address] }) as Promise<boolean>,
    publicClient.readContract({ address: BADGE, abi: badgeAbi, functionName: "minCompleted" }) as Promise<number>,
  ]);
  let image: string | null = null;
  if (tokenId > 0n) {
    const uri = (await publicClient.readContract({ address: BADGE, abi: badgeAbi, functionName: "tokenURI", args: [tokenId] })) as string;
    try {
      image = (JSON.parse(atob(uri.split(",")[1])) as { image: string }).image;
    } catch {
      image = null;
    }
  }
  return { tokenId, eligible, trusted, minCompleted: Number(minCompleted), image };
}

export function useTrust(address?: Address) {
  return usePoll<TrustInfo | null>(async () => (address ? readTrust(address) : null), [address], 12000);
}

/** Small "Trusted landlord" marker shown next to a landlord's address. */
export function TrustChip({ address, className }: { address?: Address; className?: string }) {
  const t = useT();
  const { data } = useTrust(address);
  if (!data?.trusted) return null;
  return (
    <span className={cx("inline-flex items-center gap-1 border border-brand-500/50 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-300", className)}>
      <Icon name="shield" className="h-3 w-3" />
      {t.badge.chip}
    </span>
  );
}

/** Badge card for a profile: shows the on-chain image, progress, and claim / revoke actions. */
export function TrustCard({ address, completed }: { address: Address; completed: number }) {
  const t = useT();
  const b = t.badge;
  const w = useWallet();
  const toast = useToast();
  const { data, refresh } = useTrust(address);
  const [busy, setBusy] = useState(false);
  const isMe = w.active?.address.toLowerCase() === address.toLowerCase();

  if (!hasBadge) {
    return (
      <Card>
        <h2 className="font-bold">{b.title}</h2>
        <p className="mt-2 text-sm text-zinc-400">{b.notDeployed}</p>
      </Card>
    );
  }
  if (!data) return null;
  const need = data.minCompleted || D.badgeMinCompleted || 1;

  async function claim() {
    if (!w.active) return;
    setBusy(true);
    try {
      const tx = await relayBadgeClaim({ address: w.active.address, signTypedData: w.signTypedData });
      toast({ tone: "good", text: b.claimed, tx });
      await refresh();
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      // Revoking is permissionless: any signed-in user can do it once the record no longer qualifies.
      if (!w.active) return;
      const tx = await relayCallRaw({ address: w.active.address, signTypedData: w.signTypedData }, BADGE, badgeAbi, "revoke", [address]);
      toast({ tone: "good", text: b.revoked, tx });
      await refresh();
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cx(data.trusted && "border-t-2 border-t-brand-500")}>
      <div className="flex flex-col gap-5 sm:flex-row">
        {data.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.image} alt={b.title} className="h-40 w-40 shrink-0 border border-zinc-800" />
        ) : (
          <div className="grid h-40 w-40 shrink-0 place-items-center border border-dashed border-zinc-700 text-zinc-600">
            <Icon name="shield" className="h-12 w-12" />
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <h2 className="font-bold">{b.title}</h2>
          <p className={cx("font-mono text-xs font-bold uppercase tracking-wider", data.tokenId > 0n ? "text-brand-400" : "text-zinc-500")}>
            {data.tokenId > 0n ? b.holder(data.tokenId.toString()) : b.notHolder}
          </p>
          <p className="text-sm text-zinc-400">{b.lead}</p>
          <p className="text-xs text-zinc-500">{b.rules(need)}</p>
          {data.tokenId === 0n && (
            <div>
              <div className="mt-2 h-1.5 w-full max-w-xs bg-zinc-800">
                <div className="h-1.5 bg-brand-500" style={{ width: `${Math.min(100, (completed / need) * 100)}%` }} />
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-400">{b.progress(Math.min(completed, need), need)}</p>
            </div>
          )}
          {data.tokenId === 0n && data.eligible && <p className="text-sm text-emerald-300">{b.eligible}</p>}
          {data.tokenId > 0n && !data.trusted && <p className="text-sm text-amber-300">{b.noLongerTrusted}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {isMe && data.tokenId === 0n && data.eligible && (
              <Button loading={busy} onClick={claim}>
                {b.claim}
              </Button>
            )}
            {data.tokenId > 0n && !data.trusted && w.active && (
              <Button variant="danger" loading={busy} onClick={revoke}>
                {b.revoke}
              </Button>
            )}
          </div>
          <p className="font-mono text-[11px] text-zinc-500">
            {b.readableBy}{" "}
            <a className="text-brand-400 hover:underline" href={explorerAddress(BADGE) || "#"} target="_blank" rel="noreferrer">
              {BADGE.slice(0, 10)}…
            </a>
          </p>
        </div>
      </div>
    </Card>
  );
}
