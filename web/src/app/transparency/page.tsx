"use client";

import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Card, CardSkeleton, Eyebrow, cx } from "@/components/ui";
import { explorerAddress, isDeployed } from "@/lib/config";
import { fmtUsdc, fmtVnd } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

type Data = {
  network: string;
  chainId: number;
  block: { number: string; timestamp: number };
  contracts: { name: string; address: string; role: string; deployed: boolean; codeSize: number; match: string | null }[];
  solvency: { held: string; inEscrow: string; inVault: string; locked: string; openLeases: number; totalLeases: number; solvent: boolean };
  relayer: { address: string; avax: string | null; txs: number | null } | null;
  defaults: { responseWindow: number; mediationTimeout: number };
};

export default function TransparencyPage() {
  const t = useT();
  const p = t.transparency;
  const toast = useToast();
  const { data, error } = usePoll<Data | null>(
    async () => {
      const res = await fetch("/api/transparency");
      if (!res.ok) throw new Error((await res.json()).error ?? "ReadFailed");
      return res.json();
    },
    [],
    10000,
  );

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;

  const held = data ? BigInt(data.solvency.held) : 0n;
  const locked = data ? BigInt(data.solvency.locked) : 0n;
  const max = held > locked ? held : locked;
  const pct = (x: bigint) => (max > 0n ? Number((x * 1000n) / max) / 10 : 0);

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast({ tone: "info", text: p.copied });
    } catch {}
  };

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow className="mb-3">{p.eyebrow}</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{p.title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{p.lead}</p>
      </div>

      {error && !data && <p className="text-sm text-amber-300">{p.unavailable}</p>}
      {!data && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      )}

      {data && (
        <div className="stagger grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className={cx("space-y-5 border-t-2", data.solvency.solvent ? "border-t-emerald-500" : "border-t-brand-500")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{p.solvencyTitle}</h2>
                <p className="text-sm text-zinc-400">{p.solvencyBody}</p>
              </div>
              <span
                className={cx(
                  "relative grid h-12 w-12 shrink-0 animate-pop place-items-center rounded-full",
                  data.solvency.solvent ? "bg-emerald-500 text-white" : "bg-brand-500 text-white",
                )}
              >
                <span className={cx("absolute inset-0 rounded-full", data.solvency.solvent ? "" : "animate-ring")} />
                <Icon name={data.solvency.solvent ? "check" : "alert"} className="h-6 w-6" />
              </span>
            </div>
            <p className={cx("text-2xl font-extrabold", data.solvency.solvent ? "text-emerald-300" : "text-brand-400")}>
              {data.solvency.solvent ? p.solvent : p.insolvent}
            </p>
            {[
              { label: p.held, x: held, cls: "bg-emerald-500" },
              { label: p.locked, x: locked, cls: "bg-brand-500" },
            ].map((r) => (
              <div key={r.label} className="space-y-1.5">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-zinc-400">{r.label}</span>
                  <span className="font-semibold">
                    {fmtUsdc(r.x, t.locale)} <span className="text-zinc-500">≈ {fmtVnd(r.x, t.locale)}</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden bg-zinc-800">
                  <div className={cx("h-full transition-[width] duration-1000 ease-out", r.cls)} style={{ width: `${Math.max(pct(r.x), r.x > 0n ? 2 : 0)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-zinc-500">
              {p.breakdown(fmtUsdc(BigInt(data.solvency.inEscrow), t.locale), fmtUsdc(BigInt(data.solvency.inVault), t.locale), data.solvency.openLeases, data.solvency.totalLeases)}
            </p>
            <p className="flex items-center gap-2 font-mono text-xs text-zinc-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {p.liveAt(data.block.number, new Date(data.block.timestamp * 1000).toLocaleTimeString(t.locale))}
            </p>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-bold">{p.rulesTitle}</h2>
            <ul className="space-y-3">
              {p.rules.map((r) => (
                <li key={r} className="flex gap-3 text-sm text-zinc-300">
                  <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {data.relayer && (
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-sm font-semibold">{p.relayerTitle}</p>
                <p className="mt-1 text-sm text-zinc-400">{p.relayerBody(data.relayer.txs ?? 0, data.relayer.avax ? Number(data.relayer.avax).toFixed(3) : "?")}</p>
                <a
                  href={explorerAddress(data.relayer.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block break-all font-mono text-xs text-brand-400 hover:text-brand-300"
                >
                  {data.relayer.address}
                </a>
              </div>
            )}
          </Card>
        </div>
      )}

      {data && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{p.contractsTitle}</h2>
          <div className="stagger grid gap-3 md:grid-cols-2">
            {data.contracts.map((c) => (
              <div key={c.address} className="group border border-zinc-800 bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono font-bold text-white">{c.name}</p>
                  {c.match ? (
                    <Badge tone="good">
                      <Icon name="check" className="h-3 w-3" />
                      {p.verified(c.match)}
                    </Badge>
                  ) : (
                    <Badge tone="warn">{p.notVerified}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-400">{p.roles[c.role]}</p>
                <button onClick={() => copy(c.address)} className="mt-2 block break-all text-left font-mono text-xs text-zinc-300 transition-colors hover:text-white" title={p.copy}>
                  {c.address}
                </button>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                  {explorerAddress(c.address) && (
                    <a className="text-brand-400 hover:text-brand-300" href={explorerAddress(c.address)} target="_blank" rel="noreferrer">
                      Snowtrace →
                    </a>
                  )}
                  <a className="text-brand-400 hover:text-brand-300" href={`https://repo.sourcify.dev/${data.chainId}/${c.address}`} target="_blank" rel="noreferrer">
                    {p.source} →
                  </a>
                  <span className="text-zinc-600">{p.bytes(c.codeSize)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
