"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useStats } from "@/lib/hooks";
import { type Dict, useT } from "@/lib/i18n";
import { type Stats } from "@/lib/lease";
import { Badge } from "./ui";

export type Verdict = { tone: "neutral" | "good" | "warn" | "bad"; label: string };

export function verdict(s: Stats, role: "landlord" | "tenant", t: Dict): Verdict {
  const flags = s.disputesLost + s.timeouts + s.ghosted;
  if (s.completed === 0 && flags === 0) return { tone: "neutral", label: t.rep.noHistory };
  if (flags === 0) return { tone: "good", label: role === "landlord" ? t.rep.goodLandlord : t.rep.goodTenant };
  if (flags >= 2 && flags * 2 > s.completed) return { tone: "bad", label: t.rep.bad };
  return { tone: "warn", label: t.rep.flagged(flags) };
}

/** USDC-days: deposit value multiplied by how long it was held. Fake leases are expensive to farm. */
export function usdcDays(s: Stats) {
  return Number(s.valueSeconds) / 1e6 / 86400;
}

export function ReputationBadge({ address, role }: { address: Address; role: "landlord" | "tenant" }) {
  const t = useT();
  const { data } = useStats(address);
  if (!data) return null;
  const s = role === "landlord" ? data.landlord : data.tenant;
  const v = verdict(s, role, t);
  return (
    <Link href={`/u/${address}`} className="inline-flex items-center gap-1.5">
      <Badge tone={v.tone}>{v.label}</Badge>
      {s.completed > 0 && <span className="text-xs text-stone-500">{t.rep.leases(s.completed)}</span>}
    </Link>
  );
}

export function StatsGrid({ s, role }: { s: Stats; role: "landlord" | "tenant" }) {
  const t = useT();
  const items: [string, string | number, boolean?][] = [
    [t.rep.completed, s.completed],
    [t.rep.amicable, s.amicable],
    [t.rep.disputes, s.disputes],
    [t.rep.lost, s.disputesLost, s.disputesLost > 0],
    [role === "landlord" ? t.rep.timeoutsLandlord : t.rep.timeoutsTenant, s.timeouts, s.timeouts > 0],
    [role === "landlord" ? t.rep.ghostLandlord : t.rep.ghostTenant, s.ghosted, s.ghosted > 0],
    [t.rep.volume, `${usdcDays(s).toLocaleString(t.locale, { maximumFractionDigits: 1 })} ${t.rep.usdcDays}`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([k, v, bad]) => (
        <div key={k} className="rounded-xl bg-stone-50 p-3">
          <dt className="text-xs text-stone-500">{k}</dt>
          <dd className={bad ? "mt-1 text-lg font-bold text-rose-700" : "mt-1 text-lg font-bold text-stone-900"}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
