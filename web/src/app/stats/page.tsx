"use client";

import Link from "next/link";
import { Badge, Card, Eyebrow, Spinner } from "@/components/ui";
import { ESCROW, explorerAddress, isDeployed } from "@/lib/config";
import { fmtUsdc, fmtVnd, shortAddr } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { STATUS_TONE } from "@/lib/lease";

type StatsResponse = {
  leases: number;
  reserved: number;
  openOffers: number;
  lockedNow: string;
  secured: string;
  landlords: number;
  tenants: number;
  completed: number;
  amicable: number;
  amicableRate: number | null;
  disputes: number;
  mediatorRulings: number;
  mediatorTimeouts: number;
  landlordTimeouts: number;
  fakeLandlordRefunds: number;
  tenantNoShows: number;
  byStatus: Record<string, number>;
  recent: { id: string; status: number; deposit: string; title: string | null }[];
  error?: string;
};

const BAR_COLORS: Record<number, string> = {
  1: "bg-zinc-500",
  2: "bg-sky-400",
  3: "bg-emerald-400",
  4: "bg-amber-400",
  5: "bg-amber-500",
  6: "bg-rose-400",
  7: "bg-brand-500",
  8: "bg-zinc-200",
  9: "bg-zinc-700",
};

export default function StatsPage() {
  const t = useT();
  const s = t.stats;
  const loc = t.locale;
  const { data, error } = usePoll<StatsResponse>(async () => {
    const res = await fetch("/api/stats", { cache: "no-store" });
    const json = (await res.json()) as StatsResponse;
    if (!res.ok) throw new Error(json.error || "Failed");
    return json;
  }, [], 10000);

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;
  if (!data) return error ? <p className="text-rose-300">{error.message}</p> : <Spinner className="text-zinc-500" />;

  const big = [
    { label: s.lockedNow, value: fmtVnd(BigInt(data.lockedNow), loc), sub: fmtUsdc(BigInt(data.lockedNow), loc) },
    { label: s.secured, value: fmtVnd(BigInt(data.secured), loc), sub: fmtUsdc(BigInt(data.secured), loc) },
    { label: s.reserved, value: data.reserved.toLocaleString(loc), sub: s.ofLeases(data.leases) },
    {
      label: s.amicableRate,
      value: data.amicableRate === null ? "—" : `${Math.round(data.amicableRate * 100)}%`,
      sub: data.amicableRate === null ? s.na : `${data.amicable}/${data.completed}`,
    },
  ];
  const small = [
    [s.fakeRefunds, data.fakeLandlordRefunds],
    [s.landlordTimeouts, data.landlordTimeouts],
    [s.disputes, data.disputes],
    [s.rulings, data.mediatorRulings],
    [s.mediatorTimeouts, data.mediatorTimeouts],
    [s.noShows, data.tenantNoShows],
    [s.landlords, data.landlords],
    [s.tenants, data.tenants],
    [s.openOffers, data.openOffers],
  ] as const;
  const total = Object.values(data.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse bg-brand-500" />
          {s.eyebrow}
        </Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{s.title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{s.lead}</p>
        <p className="mt-3 font-mono text-xs text-zinc-500">
          {s.contract}:{" "}
          <a className="text-brand-400 hover:underline" href={explorerAddress(ESCROW) || "#"} target="_blank" rel="noreferrer">
            {shortAddr(ESCROW)}
          </a>{" "}
          · {s.updated}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {big.map((b) => (
          <div key={b.label} className="border border-zinc-800 border-t-2 border-t-brand-500 bg-surface p-5">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-400">{b.label}</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{b.value}</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">{b.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-3">
        {small.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 bg-canvas px-5 py-4">
            <span className="text-sm text-zinc-400">{label}</span>
            <span className="font-mono text-xl font-bold text-white">{value}</span>
          </div>
        ))}
      </div>

      <Card>
        <h2 className="mb-4 font-bold">{s.byStatus}</h2>
        {total === 0 ? (
          <p className="text-sm text-zinc-400">{s.empty}</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden bg-zinc-900">
              {Object.entries(data.byStatus).map(([k, v]) => (
                <span key={k} className={BAR_COLORS[Number(k)] ?? "bg-zinc-600"} style={{ width: `${(v / total) * 100}%` }} title={`${t.status[Number(k)]}: ${v}`} />
              ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
              {Object.entries(data.byStatus).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={`h-2 w-2 ${BAR_COLORS[Number(k)] ?? "bg-zinc-600"}`} />
                  {t.status[Number(k)]} <b className="font-mono text-zinc-200">{v}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <section className="border border-zinc-800 bg-surface">
        <h2 className="px-5 pt-5 font-bold">{s.recent}</h2>
        {data.recent.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-zinc-400">{s.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800 border-t border-zinc-800">
            {data.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/l/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="mr-2 font-mono text-xs text-zinc-500">#{r.id}</span>
                    <span className="truncate text-sm font-medium text-zinc-100">{r.title ?? t.lease.roomFallback}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden font-mono text-xs text-zinc-400 sm:inline">{fmtVnd(BigInt(r.deposit), loc)}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{t.status[r.status]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
