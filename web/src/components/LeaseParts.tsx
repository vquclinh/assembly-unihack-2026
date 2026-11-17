"use client";

import { TrustChip } from "./TrustBadge";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type Address, zeroAddress } from "viem";
import { type CalendarEvent, buildIcs, downloadIcs } from "@/lib/calendar";
import { D, explorerTx } from "@/lib/config";
import { fmtDate, fmtDuration, fmtUsdc, fmtVnd, shortAddr } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { Status, finalizeDueAt, stepIndex, type Lease } from "@/lib/lease";
import { Icon, type IconName } from "./icons";
import { ReputationBadge } from "./Reputation";
import { Card, CardSkeleton, Row, cx } from "./ui";
import { useToast } from "./toast";

export function Stepper({ status }: { status: number }) {
  const t = useT();
  const cur = stepIndex(status);
  const cancelled = status === Status.Cancelled;
  return (
    <ol className="flex items-center gap-1.5">
      {t.steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1.5">
          <span
            className={cx(
              "h-1.5",
              cancelled ? "bg-zinc-700" : i < cur || (i === cur && cur === 4) ? "bg-brand-500" : i === cur ? "bg-brand-400" : "bg-zinc-800",
            )}
          />
          <span className={cx("text-xs sm:text-xs", i === cur ? "font-semibold text-zinc-50" : "text-zinc-400")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Countdown({ until, now, before, after }: { until: number; now: number; before: string; after: string }) {
  const t = useT();
  const left = until - now;
  return (
    <p className={cx("rounded-none px-3 py-2 text-sm", left > 0 ? "bg-brand-500/10 text-brand-200" : "bg-amber-500/10 text-amber-300")}>
      {left > 0 ? (
        <>
          {before} <b>{fmtDuration(left, t)}</b>
        </>
      ) : (
        after
      )}
    </p>
  );
}

export function Money({ x }: { x: bigint }) {
  const t = useT();
  return (
    <span>
      {fmtVnd(x, t.locale)} <span className="font-normal text-zinc-400">({fmtUsdc(x, t.locale)})</span>
    </span>
  );
}

export function MoneyCard({ L, value }: { L: Lease; value: bigint }) {
  const t = useT();
  const yieldNow = L.yieldOn && value > L.balance ? value - L.balance : 0n;
  return (
    <Card>
      <h2 className="mb-1 font-bold">{t.money.title}</h2>
      <div className="divide-y divide-zinc-800">
        <Row label={t.money.hold}>
          <Money x={L.holdAmount} />
        </Row>
        <Row label={t.money.total}>
          <Money x={L.depositAmount} />
        </Row>
        <Row label={t.money.locked}>
          <Money x={L.balance} />
        </Row>
        {L.yieldOn && (
          <Row label={t.money.yield}>
            <span className="text-emerald-300">+{fmtUsdc(yieldNow, t.locale)}</span>
          </Row>
        )}
        {L.proposedDeduction > 0n && (
          <Row label={t.money.proposed}>
            <Money x={L.proposedDeduction} />
          </Row>
        )}
        {L.disputedAmount > 0n && (
          <Row label={t.money.disputed}>
            <Money x={L.disputedAmount} />
          </Row>
        )}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        {t.money.note(L.yieldOn ? t.money.yieldOn : L.landlordYieldOptIn ? t.money.yieldOffered : t.money.yieldOff)}
      </p>
    </Card>
  );
}

function Party({ label, address, role, me }: { label: string; address: Address; role?: "landlord" | "tenant"; me?: Address }) {
  const t = useT();
  const isMe = me && address.toLowerCase() === me.toLowerCase();
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-zinc-400">{label}</span>
        {address === zeroAddress ? (
          <span className="text-zinc-500">{t.common.none}</span>
        ) : (
          <a href={`/u/${address}`} className="font-mono text-xs hover:underline">
            {shortAddr(address)} {isMe && <b className="font-sans text-brand-400">{t.common.you}</b>}
          </a>
        )}
      </div>
      {address !== zeroAddress && role && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
          {role === "landlord" && <TrustChip address={address} />}
          <ReputationBadge address={address} role={role} />
        </div>
      )}
    </div>
  );
}

export function PartiesCard({ L, me }: { L: Lease; me?: Address }) {
  const t = useT();
  return (
    <Card>
      <h2 className="mb-1 font-bold">{t.parties.title}</h2>
      <div className="divide-y divide-zinc-800">
        <Party label={t.parties.landlord} address={L.landlord} role="landlord" me={me} />
        <Party label={t.parties.tenant} address={L.tenant} role="tenant" me={me} />
        <Party label={t.parties.mediator} address={L.mediator} me={me} />
      </div>
    </Card>
  );
}

export function ShareCard({ id }: { id: string }) {
  const toast = useToast();
  const t = useT();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/l/${id}`), [id]);
  if (!url) return null;
  return (
    <Card className="text-center">
      <h2 className="font-bold">{t.share.title}</h2>
      <div className="mx-auto my-4 w-fit rounded-none bg-surface p-3 ring-1 ring-zinc-800">
        <QRCodeSVG value={url} size={168} />
      </div>
      <p className="break-all font-mono text-xs text-zinc-400">{url}</p>
      <button
        className="mt-3 rounded-sm bg-zinc-900 px-3 py-2 text-sm font-semibold hover:bg-zinc-800"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          toast({ tone: "info", text: t.share.copied });
        }}
      >
        {t.share.copy}
      </button>
    </Card>
  );
}

type HistoryEvent = { name: string; args: Record<string, string | boolean>; block: string; time: number | null; tx: string; logIndex: number };

const EVENT_ICON: Record<string, IconName> = {
  OfferCreated: "link",
  OfferWindows: "clock",
  OfferCancelled: "xCircle",
  Reserved: "lock",
  ConditionProposed: "camera",
  MovedIn: "home",
  ReservationCancelled: "xCircle",
  NoShowClaimed: "alert",
  ReleaseRequested: "logOut",
  SettlementProposed: "fileText",
  Disputed: "scale",
  Resolved: "scale",
  YieldPaid: "sparkles",
  Closed: "check",
  Paid: "wallet",
};

/**
 * The lease's full on-chain history, from the offer to the last payment, with a link to
 * every transaction. It doubles as the receipt: the "Paid" rows are the money that moved.
 */
export function Receipt({ id, L, status }: { id: bigint; L: Lease; status: number }) {
  const t = useT();
  const h = t.history;
  const open = status !== Status.Closed && status !== Status.Cancelled;
  const { data } = usePoll<HistoryEvent[] | null>(
    async () => {
      const res = await fetch(`/api/history/${id}`);
      if (!res.ok) return null;
      return ((await res.json()) as { events: HistoryEvent[] }).events;
    },
    [id.toString(), status],
    open ? 10000 : 60000,
  );
  const [all, setAll] = useState(false);

  const who = (a?: string | boolean) => {
    const x = String(a ?? "").toLowerCase();
    return x === L.tenant.toLowerCase() ? t.parties.tenant : x === L.landlord.toLowerCase() ? t.parties.landlord : x === L.mediator.toLowerCase() ? t.parties.mediator : shortAddr(String(a));
  };
  const money = (x?: string | boolean) => fmtUsdc(BigInt(String(x ?? "0")), t.locale);
  const line = (e: HistoryEvent): string => {
    const a = e.args;
    switch (e.name) {
      case "OfferCreated":
        return h.offerCreated(money(a.holdAmount), money(a.depositAmount));
      case "OfferWindows":
        return h.windows(fmtDuration(Number(a.responseWindow), t), fmtDuration(Number(a.mediationTimeout), t));
      case "Reserved":
        return h.reserved(money(a.amount));
      case "MovedIn":
        return h.movedIn(money(a.deposit), a.yieldOn === true);
      case "SettlementProposed":
        return BigInt(String(a.deduction)) === 0n ? h.fullReturn : h.deduction(money(a.deduction));
      case "Disputed":
        return h.disputed(money(a.disputedAmount));
      case "Resolved":
        return h.resolved(money(a.toTenant), money(a.toLandlord));
      case "ReservationCancelled":
        return h.reservationCancelled(money(a.toTenant), money(a.toLandlord));
      case "YieldPaid":
        return h.yieldPaid(money(a.toTenant), money(a.toLandlord));
      case "Closed":
        return h.closed(money(a.toTenant), money(a.toLandlord));
      case "Paid":
        return h.paid(money(a.amount), who(a.to));
      default:
        return h.names[e.name] ?? e.name;
    }
  };

  if (!data) return <CardSkeleton lines={3} />;
  if (data.length === 0) return null;
  const shown = all ? data : data.slice(-6);
  const paid = data.filter((e) => e.name === "Paid");

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold">{h.title}</h2>
        <span className="font-mono text-xs text-zinc-500">{h.count(data.length)}</span>
      </div>
      {paid.length > 0 && (
        <div className="mb-4 space-y-1 border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">{t.receipt.title}</p>
          {paid.map((p) => (
            <p key={`${p.tx}-${p.logIndex}`} className="flex justify-between gap-3 text-sm">
              <span>
                {t.receipt.paidTo} <b>{who(p.args.to)}</b>
              </span>
              <b>{money(p.args.amount)}</b>
            </p>
          ))}
        </div>
      )}
      {data.length > shown.length && (
        <button onClick={() => setAll(true)} className="mb-2 text-xs font-semibold text-brand-400 hover:text-brand-300">
          {h.showAll(data.length)}
        </button>
      )}
      <ol className="relative space-y-3 border-l border-zinc-800 pl-5">
        {shown.map((e) => (
          <li key={`${e.tx}-${e.logIndex}`} className="relative animate-fade-up">
            <span className="absolute -left-[31px] top-0 grid h-5 w-5 place-items-center border border-zinc-700 bg-canvas text-brand-400">
              <Icon name={EVENT_ICON[e.name] ?? "check"} className="h-3 w-3" />
            </span>
            <p className="text-sm font-medium text-zinc-100">{line(e)}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-xs text-zinc-500">
              {e.time && <span>{fmtDate(e.time, t.locale)}</span>}
              <span>#{e.block}</span>
              {explorerTx(e.tx) && (
                <a className="text-zinc-400 underline hover:text-white" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                  {t.common.tx}
                </a>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-zinc-500">{t.receipt.note(D.network)}</p>
    </Card>
  );
}

/** Upcoming deadlines of a lease, as calendar events. */
export function leaseEvents(id: string, L: Lease, now: number, t: ReturnType<typeof useT>): CalendarEvent[] {
  const ev: CalendarEvent[] = [];
  const due = finalizeDueAt(L);
  if (L.status === Status.Offered || L.status === Status.Reserved) {
    ev.push({ uid: `${D.chainId}-${id}-movein`, at: Number(L.moveInDeadline), title: t.tools.evMoveIn(id), description: t.tools.evMoveInDesc });
  }
  if (L.status === Status.Reserved && due) {
    ev.push({ uid: `${D.chainId}-${id}-grace`, at: due, title: t.tools.evGrace(id), description: t.tools.evGraceDesc });
  } else if (due) {
    ev.push({ uid: `${D.chainId}-${id}-due-${L.actionAt}`, at: due, title: t.tools.evDue(id), description: t.tools.evDueDesc(t.status[L.status]) });
  }
  if (L.status !== Status.Closed && L.status !== Status.Cancelled && L.status < Status.ReleaseRequested) {
    ev.push({ uid: `${D.chainId}-${id}-end`, at: Number(L.leaseEnd), title: t.tools.evLeaseEnd(id), description: t.tools.evLeaseEndDesc });
  }
  return ev.filter((e) => e.at > now).sort((a, b) => a.at - b.at);
}

/** Printable bilingual agreement and calendar reminders for the deadlines. */
export function LeaseToolsCard({ id, L, now }: { id: string; L: Lease; now: number }) {
  const t = useT();
  const events = leaseEvents(id, L, now, t);
  return (
    <Card>
      <h2 className="mb-3 font-bold">{t.tools.title}</h2>
      <div className="space-y-3">
        <Link href={`/l/${id}/agreement`} className="group flex gap-3 border border-zinc-800 p-3 transition-colors hover:border-brand-500">
          <Icon name="fileText" className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-white">{t.tools.agreement}</span>
            <span className="block text-xs text-zinc-400">{t.tools.agreementHint}</span>
          </span>
        </Link>
        {events.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadIcs(`coc-${id}.ics`, buildIcs(events, `${window.location.origin}/l/${id}`))}
            className="flex w-full gap-3 border border-zinc-800 p-3 text-left transition-colors hover:border-brand-500"
          >
            <Icon name="calendar" className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{t.tools.calendar}</span>
              <span className="block text-xs text-zinc-400">{t.tools.calendarHint}</span>
              <span className="mt-1.5 block space-y-0.5 font-mono text-xs text-zinc-500">
                {events.map((e) => (
                  <span key={e.uid} className="block truncate">
                    {new Date(e.at * 1000).toLocaleString(t.locale, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} · {e.title.replace(/^C[oọ]c #\d+: /, "")}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ) : (
          <p className="text-xs text-zinc-500">{t.tools.noDeadlines}</p>
        )}
      </div>
    </Card>
  );
}
