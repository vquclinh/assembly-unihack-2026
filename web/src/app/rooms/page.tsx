"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { Icon } from "@/components/icons";
import { verdict } from "@/components/Reputation";
import { ReportButton } from "@/components/ScamReport";
import { Badge, Eyebrow, Spinner, cx, inputCls } from "@/components/ui";
import { isDeployed } from "@/lib/config";
import { fileUrl } from "@/lib/files";
import { fmtDate, fmtVnd } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import type { Stats } from "@/lib/lease";

type Room = {
  id: string;
  landlord: Address;
  hold: string;
  deposit: string;
  moveInDeadline: number;
  yieldOptIn: boolean;
  title: string;
  address: string;
  rentVnd: number;
  notes: string;
  photos: Hex[];
  stats: Omit<Stats, "valueSeconds"> & { valueSeconds: string };
  trusted: boolean;
  reports: number;
};

/** Higher is better: completed leases, minus red flags and community reports. */
function score(r: Room) {
  const s = r.stats;
  return (r.trusted ? 100 : 0) + s.completed * 10 + s.amicable * 3 - (s.disputesLost + s.timeouts + s.ghosted) * 25 - r.reports * 15;
}

export default function RoomsPage() {
  const t = useT();
  const r = t.rooms;
  const loc = t.locale;
  const [q, setQ] = useState("");
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [sort, setSort] = useState(0);
  const { data, error, refresh } = usePoll<{ rooms: Room[] }>(async () => {
    const res = await fetch("/api/rooms", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    return json;
  }, [], 15000);

  const rooms = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = (data?.rooms ?? []).filter((x) => (!trustedOnly || x.trusted) && (!needle || `${x.title} ${x.address} ${x.notes}`.toLowerCase().includes(needle)));
    if (sort === 1) list = [...list].sort((a, b) => a.rentVnd - b.rentVnd);
    if (sort === 2) list = [...list].sort((a, b) => score(b) - score(a));
    return list;
  }, [data, q, trustedOnly, sort]);

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow className="mb-3">{r.eyebrow}</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{r.title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{r.lead}</p>
        <p className="mt-4 flex max-w-2xl items-start gap-2 border-l-2 border-amber-400 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
          {r.safety}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input className={cx(inputCls, "sm:max-w-sm")} placeholder={r.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={trustedOnly} onChange={(e) => setTrustedOnly(e.target.checked)} />
          {r.trustedOnly}
        </label>
        <div className="flex border border-zinc-700 text-xs font-semibold sm:ml-auto" role="group" aria-label={r.sort}>
          {r.sorts.map((label, i) => (
            <button
              key={label}
              onClick={() => setSort(i)}
              aria-pressed={sort === i}
              className={cx("min-h-10 px-3 transition-colors", sort === i ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!data && !error && <Spinner className="text-zinc-500" />}
      {error && <p className="text-rose-300">{error.message}</p>}
      {data && (
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">{r.count(rooms.length)}</p>
      )}
      {data && data.rooms.length === 0 && <p className="border border-dashed border-zinc-700 p-8 text-center text-zinc-400">{r.empty}</p>}
      {data && data.rooms.length > 0 && rooms.length === 0 && <p className="text-zinc-400">{r.noMatch}</p>}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => {
          const v = verdict({ ...room.stats, valueSeconds: BigInt(room.stats.valueSeconds) }, "landlord", t);
          return (
            <article key={room.id} className={cx("flex flex-col border bg-surface", room.trusted ? "border-brand-500/50" : "border-zinc-800")}>
              <Link href={`/l/${room.id}`} className="group relative block aspect-[4/3] overflow-hidden bg-zinc-900">
                {room.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(room.photos[0])} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="bg-grid grid h-full w-full place-items-center text-zinc-700">
                    <Icon name="home" className="h-12 w-12" />
                  </div>
                )}
                <span className="absolute left-3 top-3 bg-canvas/90 px-2 py-1 font-mono text-[11px] font-bold text-zinc-200">#{room.id}</span>
                {room.trusted && (
                  <span className="absolute right-3 top-3 flex items-center gap-1 bg-brand-500 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                    <Icon name="shield" className="h-3 w-3" />
                    {t.badge.chip}
                  </span>
                )}
                {room.photos.length > 1 && (
                  <span className="absolute bottom-3 right-3 bg-canvas/90 px-2 py-0.5 font-mono text-[10px] text-zinc-300">+{room.photos.length - 1}</span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h2 className="line-clamp-2 font-bold text-white">{room.title}</h2>
                  {room.address && <p className="mt-0.5 line-clamp-1 text-sm text-zinc-400">{room.address}</p>}
                </div>
                {room.rentVnd > 0 && (
                  <p className="text-xl font-extrabold tracking-tight text-white">
                    {room.rentVnd.toLocaleString(loc)} ₫<span className="text-sm font-medium text-zinc-500">{r.perMonth}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 border border-zinc-800 text-xs">
                  <div className="border-r border-zinc-800 p-2">
                    <p className="font-mono uppercase tracking-wider text-zinc-500">{r.hold}</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{fmtVnd(BigInt(room.hold), loc)}</p>
                  </div>
                  <div className="p-2">
                    <p className="font-mono uppercase tracking-wider text-zinc-500">{r.deposit}</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{fmtVnd(BigInt(room.deposit), loc)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/u/${room.landlord}`}>
                    <Badge tone={v.tone}>{v.label}</Badge>
                  </Link>
                  {room.stats.completed > 0 && <span className="text-xs text-zinc-400">{t.rep.leases(room.stats.completed)}</span>}
                  {room.yieldOptIn && <Badge tone="neutral">{r.yieldOn}</Badge>}
                  {room.reports > 0 && <Badge tone="bad">{r.reports(room.reports)}</Badge>}
                </div>
                <p className="font-mono text-[11px] text-zinc-500">{r.moveInBy(fmtDate(room.moveInDeadline, loc))}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  <ReportButton landlord={room.landlord} leaseId={room.id} onSent={() => void refresh()} />
                  <Link href={`/l/${room.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-400 hover:text-brand-300">
                    {r.view}
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
