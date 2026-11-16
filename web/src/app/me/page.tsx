"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Address } from "viem";
import { useTermsTitle } from "@/components/docs";
import { StatsGrid } from "@/components/Reputation";
import { Badge, ButtonLink, Card, Spinner } from "@/components/ui";
import { publicClient } from "@/lib/client";
import { ESCROW, escrowAbi, isDeployed } from "@/lib/config";
import { fmtVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { usePoll, useStats } from "@/lib/hooks";
import { type Lease, STATUS_TONE } from "@/lib/lease";
import { useWallet } from "@/lib/wallet";

type Item = { id: bigint; lease: Lease };

async function loadLeases(address: Address) {
  const fns = ["leasesOfLandlord", "leasesOfTenant", "leasesOfMediator"] as const;
  const ids = (await Promise.all(
    fns.map((fn) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: fn, args: [address] })),
  )) as bigint[][];
  const all = [...new Set(ids.flat().map((x) => x.toString()))].map(BigInt);
  const leases = (await Promise.all(
    all.map((id) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] })),
  )) as Lease[];
  const items = all.map((id, i) => ({ id, lease: leases[i] }));
  items.sort((a, b) => Number(b.id - a.id));
  const as = (n: number) => new Set(ids[n].map((x) => x.toString()));
  return { items, landlord: as(0), tenant: as(1), mediator: as(2) };
}

function LeaseRow({ item, role }: { item: Item; role: string }) {
  const t = useT();
  const title = useTermsTitle(item.lease.termsHash);
  return (
    <Link href={`/l/${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 hover:border-emerald-300">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title ?? t.lease.number(item.id.toString())}</p>
        <p className="text-xs text-stone-500">
          #{item.id.toString()} · {role} · {t.me.deposit} {fmtVnd(item.lease.depositAmount, t.locale)}
        </p>
      </div>
      <Badge tone={STATUS_TONE[item.lease.status]} className="shrink-0">
        {t.status[item.lease.status]}
      </Badge>
    </Link>
  );
}

export default function MePage() {
  const w = useWallet();
  const t = useT();
  const me = w.active?.address;
  const { data } = usePoll(async () => (isDeployed && me ? loadLeases(me) : null), [me], 6000);
  const { data: stats } = useStats(me);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.map((it) => {
      const k = it.id.toString();
      const role = data.landlord.has(k) ? t.me.asLandlord : data.tenant.has(k) ? t.me.asTenant : t.me.asMediator;
      return { it, role };
    });
  }, [data, t]);

  if (!w.ready) return <Spinner className="text-stone-400" />;
  if (!me)
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">{t.me.noWalletTitle}</h1>
        <p className="mt-2 text-sm text-stone-600">{t.me.noWalletBody}</p>
      </Card>
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.me.title}</h1>
          <p className="text-sm text-stone-500">
            {w.active?.label} · <span className="font-mono">{me}</span>
          </p>
        </div>
        <ButtonLink href="/create">{t.nav.create}</ButtonLink>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t.me.deposits}</h2>
        {!data && <Spinner className="text-stone-400" />}
        {data && rows.length === 0 && <p className="text-sm text-stone-600">{t.me.empty}</p>}
        <div className="space-y-2">
          {rows.map(({ it, role }) => (
            <LeaseRow key={it.id.toString()} item={it} role={role} />
          ))}
        </div>
      </section>

      {stats && (
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-bold">{t.me.landlordProfile}</h2>
            <StatsGrid s={stats.landlord} role="landlord" />
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">{t.me.tenantProfile}</h2>
            <StatsGrid s={stats.tenant} role="tenant" />
          </Card>
        </section>
      )}
    </div>
  );
}
