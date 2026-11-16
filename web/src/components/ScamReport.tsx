"use client";

import { useState } from "react";
import type { Address } from "viem";
import { errorText } from "@/lib/errors";
import { fmtDate, shortAddr } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { REPORT_DOMAIN, REPORT_REASONS, REPORT_TYPES, type ReportReason } from "@/lib/reports";
import { useWallet } from "@/lib/wallet";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { Button, Card, inputCls } from "./ui";

type PublicReport = { reporter: Address; leaseId: string; reason: ReportReason; note: string; timestamp: number };

export function useReports(landlord?: Address) {
  return usePoll<{ count: number; reports: PublicReport[] } | null>(
    async () => {
      if (!landlord) return null;
      const res = await fetch(`/api/reports?landlord=${landlord}`, { cache: "no-store" });
      return res.ok ? res.json() : null;
    },
    [landlord],
    15000,
  );
}

/** "Report a scam" button with an inline form. The report is signed with the user's wallet. */
export function ReportButton({ landlord, leaseId, onSent }: { landlord: Address; leaseId: string; onSent?: () => void }) {
  const t = useT();
  const r = t.report;
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("fake_listing");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!w.active) return toast({ tone: "bad", text: r.needWallet });
    setBusy(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = { landlord, leaseId: BigInt(leaseId), reason, note: note.trim(), timestamp: BigInt(timestamp) };
      const signature = await w.signTypedData({
        domain: REPORT_DOMAIN,
        types: REPORT_TYPES,
        primaryType: "ScamReport",
        message,
      });
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ landlord, reporter: w.active.address, leaseId, reason, note: note.trim(), timestamp, signature }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed");
      toast({ tone: "good", text: r.sent });
      setOpen(false);
      setNote("");
      onSent?.();
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-brand-400">
        <Icon name="xCircle" className="h-3.5 w-3.5" />
        {r.button}
      </button>
    );

  return (
    <div className="space-y-3 border border-brand-500/40 bg-brand-500/5 p-4">
      <p className="font-bold text-white">{r.title}</p>
      <p className="text-xs text-zinc-400">{r.lead}</p>
      <div className="space-y-1.5">
        {REPORT_REASONS.map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name={`reason-${leaseId}`} className="mt-1 accent-brand-600" checked={reason === k} onChange={() => setReason(k)} />
            {r.reasons[k]}
          </label>
        ))}
      </div>
      <textarea className={inputCls} rows={2} maxLength={280} placeholder={r.note} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button loading={busy} onClick={send}>
          {r.submit}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {r.cancel}
        </Button>
      </div>
    </div>
  );
}

/** Community reports shown on a landlord profile, clearly separated from on-chain facts. */
export function ReportList({ landlord }: { landlord: Address }) {
  const t = useT();
  const r = t.report;
  const { data } = useReports(landlord);
  return (
    <Card className={data?.count ? "border-brand-500/40" : undefined}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-bold">{r.listTitle}</h2>
        <span className="font-mono text-sm text-zinc-400">{data?.count ?? 0}</span>
      </div>
      <p className="text-xs text-zinc-500">{r.listLead}</p>
      {data && data.reports.length === 0 && <p className="mt-3 text-sm text-zinc-400">{r.none}</p>}
      <ul className="mt-3 divide-y divide-zinc-800">
        {data?.reports.map((x) => (
          <li key={`${x.reporter}-${x.timestamp}`} className="py-2.5 text-sm">
            <p className="font-medium text-zinc-100">{r.reasons[x.reason]}</p>
            {x.note && <p className="text-zinc-400">{x.note}</p>}
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {shortAddr(x.reporter)} · #{x.leaseId} · {fmtDate(x.timestamp, t.locale)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
