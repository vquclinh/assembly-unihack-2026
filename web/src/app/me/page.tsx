"use client";

import { TrustCard } from "@/components/TrustBadge";
import Link from "next/link";
import { useMemo } from "react";
import { useTermsTitle } from "@/components/docs";
import { StatsGrid } from "@/components/Reputation";
import { Badge, ButtonLink, Card, CardSkeleton, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { fmtDuration, fmtUsdc, fmtVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useChainClock, useStats } from "@/lib/hooks";
import { type MyLease, type Todo, todos } from "@/lib/inbox";
import { STATUS_TONE } from "@/lib/lease";
import { errorText } from "@/lib/errors";
import { relayEscrowCall } from "@/lib/tx";
import { useMyLeases } from "@/lib/useInbox";
import { useWallet } from "@/lib/wallet";
import { useState } from "react";

type Item = MyLease;

function TodoRow({ item, now }: { item: Todo; now: number }) {
  const t = useT();
  const title = useTermsTitle(item.lease.termsHash);
  const left = item.dueAt === null ? null : item.dueAt - now;
  const urgent = left !== null && left < Number(item.lease.responseWindow) / 3;
  return (
    <Link
      href={`/l/${item.id}`}
      className="group flex items-center gap-4 border border-brand-500/40 bg-brand-500/[0.06] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-[4px_4px_0_0_var(--color-brand-500)]"
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center bg-brand-500 text-white">
        <span className="absolute inset-0 animate-ring" />
        <Icon name="bolt" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{t.inbox.keys[item.key]}</p>
        <p className="truncate text-xs text-zinc-400">
          #{item.id.toString()} · {title ?? t.lease.roomFallback}
        </p>
      </div>
      {left !== null && (
        <span className={`shrink-0 text-right font-mono text-xs ${urgent ? "text-brand-400" : "text-zinc-400"}`}>
          {left > 0 ? t.inbox.left(fmtDuration(left, t)) : t.inbox.expired}
        </span>
      )}
      <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
    </Link>
  );
}

function LeaseRow({ item, role }: { item: Item; role: string }) {
  const t = useT();
  const title = useTermsTitle(item.lease.termsHash);
  return (
    <Link href={`/l/${item.id}`} className="flex items-center justify-between gap-3 rounded-none border border-zinc-800 bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/60">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title ?? t.lease.number(item.id.toString())}</p>
        <p className="text-xs text-zinc-400">
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
  const toast = useToast();
  const { me, data, refresh } = useMyLeases(6000);
  const { data: stats } = useStats(me);
  const now = useChainClock();
  const inbox = todos(data, me, now);
  const [withdrawing, setWithdrawing] = useState(false);

  async function withdraw() {
    if (!w.active) return;
    setWithdrawing(true);
    try {
      const tx = await relayEscrowCall({ address: w.active.address, signTypedData: w.signTypedData }, "withdrawCredit", []);
      toast({ tone: "good", text: t.inbox.withdrawn, tx });
      await refresh();
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setWithdrawing(false);
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.map((it) => {
      const k = it.id.toString();
      const role = data.landlord.has(k) ? t.me.asLandlord : data.tenant.has(k) ? t.me.asTenant : t.me.asMediator;
      return { it, role };
    });
  }, [data, t]);

  if (!w.ready)
    return (
      <div className="space-y-3">
        <CardSkeleton lines={1} />
        <CardSkeleton lines={2} />
      </div>
    );
  if (!me)
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">{t.me.noWalletTitle}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t.me.noWalletBody}</p>
      </Card>
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.me.title}</h1>
          <p className="text-sm text-zinc-400">
            {w.active?.label} · <span className="font-mono">{me}</span>
          </p>
        </div>
        <ButtonLink href="/create">{t.nav.create}</ButtonLink>
      </div>

      {data && data.credit > 0n && (
        <div className="flex animate-fade-up flex-wrap items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div>
            <p className="font-semibold text-emerald-200">{t.inbox.creditTitle(fmtUsdc(data.credit, t.locale))}</p>
            <p className="text-xs text-zinc-400">{t.inbox.creditBody}</p>
          </div>
          <Button loading={withdrawing} onClick={withdraw}>
            <Icon name="download" className="h-4 w-4" />
            {t.inbox.withdraw}
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="inbox" className="h-5 w-5 text-brand-500" />
          {t.inbox.title}
          {inbox.length > 0 && <span className="grid h-6 min-w-6 animate-pop place-items-center rounded-full bg-brand-500 px-2 font-mono text-xs text-white">{inbox.length}</span>}
        </h2>
        {!data && <CardSkeleton lines={1} />}
        {data && inbox.length === 0 && (
          <p className="flex items-center gap-2 border border-dashed border-zinc-800 p-4 text-sm text-zinc-400">
            <Icon name="check" className="h-4 w-4 text-emerald-400" />
            {t.inbox.empty}
          </p>
        )}
        <div className="stagger space-y-2">
          {inbox.map((it) => (
            <TodoRow key={it.id.toString()} item={it} now={now} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t.me.deposits}</h2>
        {!data && (
          <div className="space-y-2">
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
          </div>
        )}
        {data && rows.length === 0 && <p className="text-sm text-zinc-400">{t.me.empty}</p>}
        <div className="stagger space-y-2">
          {rows.map(({ it, role }) => (
            <LeaseRow key={it.id.toString()} item={it} role={role} />
          ))}
        </div>
      </section>

      {stats && <TrustCard address={me} completed={stats.landlord.completed} />}

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
