"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { zeroHash } from "viem";
import { ActionPanel } from "@/components/Actions";
import { AiReportCard } from "@/components/AiReport";
import { ReportButton } from "@/components/ScamReport";
import { EvidenceView, ReportView, RulingView, TermsView, useTermsTitle } from "@/components/docs";
import { LeaseToolsCard, MoneyCard, PartiesCard, Receipt, ShareCard, Stepper } from "@/components/LeaseParts";
import { useToast } from "@/components/toast";
import { Badge, Card, Spinner } from "@/components/ui";
import { D, isDeployed } from "@/lib/config";
import { useChainClock, useLease } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { STATUS_TONE, Status, finalizeDueAt } from "@/lib/lease";
import { useWallet } from "@/lib/wallet";

export default function LeasePage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data: snap, error, refresh } = useLease(id);
  const now = useChainClock(snap?.chainTime, snap?.fetchedAt);
  const w = useWallet();
  const t = useT();
  const title = useTermsTitle(snap?.lease.termsHash);
  const toast = useToast();

  // Keeper: once a deadline has passed, ask the server to call `finalize` so the outcome
  // the contract promises happens without anyone pressing a button.
  const dueAt = snap ? finalizeDueAt(snap.lease, D.responseWindow, D.mediationTimeout) : null;
  const kicked = useRef("");
  useEffect(() => {
    if (!snap || id === null || dueAt === null || now < dueAt) return;
    const key = `${id}-${snap.lease.status}-${snap.lease.actionAt}`;
    if (kicked.current === key) return;
    kicked.current = key;
    fetch("/api/keeper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id.toString() }) })
      .then((r) => r.json())
      .then((j: { results?: { ok: boolean; tx?: string }[] }) => {
        const done = j.results?.find((x) => x.ok);
        if (done) {
          toast({ tone: "good", text: t.lease.autoSettled, tx: done.tx });
          refresh();
        }
      })
      .catch(() => {});
  }, [snap, id, dueAt, now, toast, t, refresh]);

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;
  if (id === null) return <p className="text-zinc-400">{t.lease.invalidId}</p>;
  if (error && !snap) return <p className="text-rose-300">{t.lease.readFail(error.message)}</p>;
  if (!snap) return <Spinner className="text-zinc-500" />;

  const L = snap.lease;
  if (L.status === Status.None) return <p className="text-zinc-400">{t.lease.notFound(id.toString())}</p>;

  const isLandlord = w.active && L.landlord.toLowerCase() === w.active.address.toLowerCase();
  const hasReport = L.conditionHash !== zeroHash;
  const tenantSeesReportInPanel = L.status === Status.Reserved && w.active && L.tenant.toLowerCase() === w.active.address.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-400">{t.lease.number(id.toString())}</span>
          <Badge tone={STATUS_TONE[L.status]}>{t.status[L.status]}</Badge>
        </div>
        <h1 data-embed-title className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title ?? t.lease.roomFallback}</h1>
        <Stepper status={L.status} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <ActionPanel id={id} L={L} now={now} refresh={async () => void (await refresh())} />

          {hasReport && !tenantSeesReportInPanel && (
            <Card>
              <ReportView hash={L.conditionHash} />
            </Card>
          )}
          {L.landlordEvidence !== zeroHash && (
            <Card>
              <EvidenceView hash={L.landlordEvidence} title={t.lease.landlordEvidence} />
            </Card>
          )}
          {hasReport && L.landlordEvidence !== zeroHash && (
            <AiReportCard key={`${L.landlordEvidence}-${L.tenantEvidence}`} leaseId={id.toString()} contested={L.status === Status.Disputed ? L.disputedAmount : L.proposedDeduction} />
          )}
          {L.tenantEvidence !== zeroHash && (
            <Card>
              <EvidenceView hash={L.tenantEvidence} title={t.lease.tenantResponse} />
            </Card>
          )}
          {L.rulingHash !== zeroHash && (
            <Card>
              <RulingView hash={L.rulingHash} />
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          {L.status === Status.Offered && isLandlord && (
            <div data-embed-hide>
              <ShareCard id={id.toString()} />
            </div>
          )}
          <MoneyCard L={L} value={snap.value} />
          {L.status === Status.Offered && !isLandlord && (
            <Card>
              <ReportButton landlord={L.landlord} leaseId={id.toString()} />
            </Card>
          )}
          <PartiesCard L={L} me={w.active?.address} />
          <Receipt id={id} L={L} status={L.status} />
          <LeaseToolsCard id={id.toString()} L={L} now={now} />
          <Card>
            <h2 className="mb-2 font-bold">{t.lease.agreement}</h2>
            <TermsView hash={L.termsHash} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
