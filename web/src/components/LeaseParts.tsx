"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { type Address, zeroAddress } from "viem";
import { publicClient } from "@/lib/client";
import { D, ESCROW, escrowAbi, explorerTx } from "@/lib/config";
import { fmtDuration, fmtUsdc, fmtVnd, shortAddr } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Status, stepIndex, type Lease } from "@/lib/lease";
import { ReputationBadge } from "./Reputation";
import { Card, Row, cx } from "./ui";
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
              "h-1.5 rounded-full",
              cancelled ? "bg-stone-300" : i < cur || (i === cur && cur === 4) ? "bg-emerald-600" : i === cur ? "bg-emerald-400" : "bg-stone-200",
            )}
          />
          <span className={cx("text-[11px] sm:text-xs", i === cur ? "font-semibold text-stone-900" : "text-stone-500")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Countdown({ until, now, before, after }: { until: number; now: number; before: string; after: string }) {
  const t = useT();
  const left = until - now;
  return (
    <p className={cx("rounded-xl px-3 py-2 text-sm", left > 0 ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900")}>
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
      {fmtVnd(x, t.locale)} <span className="font-normal text-stone-500">({fmtUsdc(x, t.locale)})</span>
    </span>
  );
}

export function MoneyCard({ L, value }: { L: Lease; value: bigint }) {
  const t = useT();
  const yieldNow = L.yieldOn && value > L.balance ? value - L.balance : 0n;
  return (
    <Card>
      <h2 className="mb-1 font-bold">{t.money.title}</h2>
      <div className="divide-y divide-stone-100">
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
            <span className="text-emerald-700">+{fmtUsdc(yieldNow, t.locale)}</span>
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
      <p className="mt-3 text-xs text-stone-500">
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
        <span className="text-stone-500">{label}</span>
        {address === zeroAddress ? (
          <span className="text-stone-400">{t.common.none}</span>
        ) : (
          <a href={`/u/${address}`} className="font-mono text-xs hover:underline">
            {shortAddr(address)} {isMe && <b className="font-sans text-emerald-700">{t.common.you}</b>}
          </a>
        )}
      </div>
      {address !== zeroAddress && role && (
        <div className="mt-1 text-right">
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
      <div className="divide-y divide-stone-100">
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
      <div className="mx-auto my-4 w-fit rounded-xl bg-white p-3 ring-1 ring-stone-200">
        <QRCodeSVG value={url} size={168} />
      </div>
      <p className="break-all font-mono text-xs text-stone-600">{url}</p>
      <button
        className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold hover:bg-stone-200"
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

type PaidEvent = { to: Address; amount: bigint; tx: string };

/** On-chain receipt: every payment this lease made, read from the contract's events. */
export function Receipt({ id, L, status }: { id: bigint; L: Lease; status: number }) {
  const t = useT();
  const [paid, setPaid] = useState<PaidEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > 2000n ? latest - 2000n : 0n;
        const logs = await publicClient.getContractEvents({ address: ESCROW, abi: escrowAbi, eventName: "Paid", args: { id }, fromBlock });
        if (!alive) return;
        setPaid(
          logs.map((l) => {
            const a = (l as unknown as { args: { to: Address; amount: bigint } }).args;
            return { to: a.to, amount: a.amount, tx: l.transactionHash as string };
          }),
        );
      } catch {
        if (alive) setPaid([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, status]);

  if (!paid || paid.length === 0) return null;
  const who = (a: Address) =>
    a.toLowerCase() === L.tenant.toLowerCase() ? t.parties.tenant : a.toLowerCase() === L.landlord.toLowerCase() ? t.parties.landlord : shortAddr(a);
  return (
    <Card>
      <h2 className="mb-1 font-bold">{t.receipt.title}</h2>
      <ul className="divide-y divide-stone-100 text-sm">
        {paid.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2">
            <span>
              {t.receipt.paidTo} <b>{who(p.to)}</b>
            </span>
            <span className="text-right">
              <b>{fmtUsdc(p.amount, t.locale)}</b>
              {explorerTx(p.tx) && (
                <a className="ml-2 text-xs text-stone-500 underline" href={explorerTx(p.tx)} target="_blank" rel="noreferrer">
                  {t.common.tx}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">{t.receipt.note(D.network)}</p>
    </Card>
  );
}
