"use client";

import { useState } from "react";
import { type Address, type Hex, zeroAddress, zeroHash } from "viem";
import { D, VND_PER_USDC } from "@/lib/config";
import { AppError, errorText } from "@/lib/errors";
import { fmtDate, fmtUsdc, fmtVnd, parseVnd, usdcNumber, vndToUsdc } from "@/lib/format";
import { useBalance, usePoll } from "@/lib/hooks";
import { type Dict, useT } from "@/lib/i18n";
import { type AiReport, Status, type Lease } from "@/lib/lease";
import { EMPTY_AUTH, relayEscrowCall, signDepositAuth } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";
import { EvidenceForm, makeRuling, ReportBuilder, ReportView } from "./docs";
import { Countdown, Money } from "./LeaseParts";
import { useConfirm } from "./confirm";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { Button, Card, inputCls } from "./ui";
import { useFaucet } from "./WalletMenu";

export type Role = keyof Dict["roles"];

function eq(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function roleOf(L: Lease, me?: Address): Role {
  if (!me) return "viewer";
  if (eq(L.landlord, me)) return "landlord";
  if (eq(L.mediator, me)) return "mediator";
  if (L.tenant !== zeroAddress && eq(L.tenant, me)) return "tenant";
  if (L.status === Status.Offered && L.tenant === zeroAddress) return "candidate";
  return "viewer";
}

/** Everything a viewer can do with a lease, depending on its state and on who they are. */
export function ActionPanel({ id, L, now, refresh }: { id: bigint; L: Lease; now: number; refresh: () => Promise<void> }) {
  const w = useWallet();
  const toast = useToast();
  const ask = useConfirm();
  const t = useT();
  const a = t.act;
  const loc = t.locale;
  const me = w.active?.address;
  const role = roleOf(L, me);
  const { data: balance, refresh: refreshBalance } = useBalance(me);
  const faucet = useFaucet();
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [deduction, setDeduction] = useState("");
  const [deductAmt, setDeductAmt] = useState(0n);
  const [acceptYield, setAcceptYield] = useState(true);
  const [toTenantPct, setToTenantPct] = useState(50);
  const [rulingText, setRulingText] = useState("");

  // The mediator can copy the AI's suggested split into the ruling form once someone bought the report.
  const { data: aiReport } = usePoll<AiReport | null>(
    async () => {
      if (L.status !== Status.Disputed || role !== "mediator") return null;
      const res = await fetch(`/api/ai-report/${id}?quote=1`);
      return res.ok ? ((await res.json()) as { report?: AiReport }).report ?? null : null;
    },
    [id.toString(), L.status, role],
    8000,
  );

  // One tap for a newcomer: create a quick wallet, get test USDC, and reserve, all without gas.
  const [quickStep, setQuickStep] = useState<"wallet" | "funds" | "sign" | null>(null);
  async function quickReserve() {
    setBusy("quick");
    try {
      setQuickStep("wallet");
      const acc = w.createQuick(t.wallet.tenantName);
      setQuickStep("funds");
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: acc.address }) });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string; detail?: string };
        if (j.error !== "FaucetEnough") throw new AppError(j.error || "FaucetFailed", j.detail);
      }
      setQuickStep("sign");
      const as = { address: acc.address, signTypedData: (p: Parameters<typeof w.signTypedDataAs>[1]) => w.signTypedDataAs(acc.id, p) };
      const tx = await relayEscrowCall(as, "reserveWithAuthorization", [id, await signDepositAuth(as, L.holdAmount)]);
      toast({ tone: "good", text: a.reserved, tx });
      await Promise.all([refresh(), refreshBalance()]);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(null);
      setQuickStep(null);
    }
  }

  const rw = L.responseWindow;
  const mt = L.mediationTimeout;
  const moveIn = Number(L.moveInDeadline);
  const actionAt = Number(L.actionAt);
  const signer = me ? { address: me, signTypedData: w.signTypedData } : null;

  async function run(key: string, fn: () => Promise<Hex>, ok: string) {
    if (!signer) return toast({ tone: "bad", text: a.needWallet });
    setBusy(key);
    try {
      const tx = await fn();
      toast({ tone: "good", text: ok, tx });
      setMode(null);
      await Promise.all([refresh(), refreshBalance()]);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(null);
    }
  }

  const call = (fn: string, args: readonly unknown[]) => relayEscrowCall(signer!, fn, args);

  const needFunds = (amount: bigint) =>
    balance !== undefined && balance < amount ? (
      <div className="rounded-none bg-amber-500/10 p-3 text-sm text-amber-300">
        {a.needFunds(fmtUsdc(balance, loc), fmtUsdc(amount, loc))}
        {D.mockToken && me && (
          <Button variant="secondary" className="mt-2 w-full" loading={faucet.busy} onClick={() => faucet.claim(me, refreshBalance)}>
            {t.wallet.faucet}
          </Button>
        )}
      </div>
    ) : null;

  const finalizeBtn = (label: string, ok: string) => (
    <Button variant="secondary" className="w-full" loading={busy === "finalize"} onClick={() => run("finalize", () => call("finalize", [id]), ok)}>
      {label}
    </Button>
  );

  const refundHoldBtn = (label: string) => (
    <Button variant="ghost" className="w-full" loading={busy === "refund"} onClick={() => run("refund", () => call("refundReservation", [id]), a.holdRefunded)}>
      {label}
    </Button>
  );

  function settlementForm() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-300">{a.settleIntro}</p>
        <Button className="w-full" loading={busy === "full"} onClick={() => run("full", () => call("proposeSettlement", [id, 0n, zeroHash]), a.fullRefunded)}>
          {a.returnFull}
        </Button>
        {mode !== "deduct" ? (
          <Button variant="secondary" className="w-full" onClick={() => setMode("deduct")}>
            {a.proposeDeduction}
          </Button>
        ) : (
          <div className="space-y-2 rounded-none border border-zinc-800 p-3">
            <label className="block text-sm font-medium">{a.deductAmount}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[10, 25, 50, 100].map((pct) => {
                const amt = (L.depositAmount * BigInt(pct)) / 100n;
                const on = deductAmt === amt;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setDeductAmt(amt);
                      setDeduction(String(Math.round((usdcNumber(amt) * VND_PER_USDC) / 1000) * 1000));
                    }}
                    className={`border py-1.5 font-mono text-xs font-bold transition-all duration-150 active:scale-95 ${
                      on ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                inputMode="numeric"
                value={deduction ? parseVnd(deduction).toLocaleString(loc) : ""}
                onChange={(e) => {
                  const vnd = parseVnd(e.target.value);
                  setDeduction(vnd ? String(vnd) : "");
                  const amt = vndToUsdc(vnd);
                  setDeductAmt(amt > L.depositAmount ? L.depositAmount : amt);
                }}
                placeholder={a.deductPlaceholder}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">₫</span>
            </div>
            {deductAmt > 0n && (
              <p className="animate-fade-in text-xs text-zinc-400">
                {a.deductPreview(fmtUsdc(deductAmt, loc), fmtVnd(L.depositAmount - deductAmt, loc))}
              </p>
            )}
            <EvidenceForm
              leaseId={id.toString()}
              role="landlord"
              placeholder={a.deductEvidencePlaceholder}
              submitLabel={a.sendProposal}
              busy={busy === "deduct"}
              onSubmit={async (h) => {
                const amount = deductAmt;
                if (amount <= 0n || amount > L.depositAmount) {
                  toast({ tone: "bad", text: a.deductInvalid });
                  return;
                }
                await run("deduct", () => call("proposeSettlement", [id, amount, h]), a.proposalSent);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const body = (() => {
    switch (L.status) {
      case Status.Offered: {
        if (role === "landlord")
          return (
            <>
              <p className="text-sm text-zinc-400">{a.offerWaiting}</p>
              <Countdown until={moveIn} now={now} before={a.linkExpiresIn} after={a.linkExpired} />
              <Button variant="danger" className="w-full" loading={busy === "cancel"} onClick={() => run("cancel", () => call("cancelOffer", [id]), a.linkCancelled)}>
                {a.cancelLink}
              </Button>
            </>
          );
        if (role === "candidate" || role === "tenant")
          return (
            <>
              <p className="text-sm text-zinc-300">{a.reserveBody(<Money x={L.holdAmount} />, fmtDate(L.moveInDeadline, loc))}</p>
              {needFunds(L.holdAmount)}
              <Button
                className="w-full text-base"
                loading={busy === "reserve"}
                disabled={now > moveIn}
                onClick={() => run("reserve", async () => call("reserveWithAuthorization", [id, await signDepositAuth(signer!, L.holdAmount)]), a.reserved)}
              >
                {a.reserve}
              </Button>
            </>
          );
        if (role === "mediator") return <p className="text-sm text-zinc-400">{a.mediatorOffer}</p>;
        if (!me && L.tenant === zeroAddress && D.mockToken)
          return (
            <>
              <p className="text-sm text-zinc-300">{a.reserveBody(<Money x={L.holdAmount} />, fmtDate(L.moveInDeadline, loc))}</p>
              <Button className="w-full text-base" loading={busy === "quick"} disabled={now > moveIn} onClick={quickReserve}>
                <Icon name="bolt" className="h-4 w-4" />
                {busy === "quick" && quickStep ? a.quickSteps[quickStep] : a.quickReserve}
              </Button>
              <p className="text-xs text-zinc-400">{a.quickReserveHint}</p>
            </>
          );
        return <p className="text-sm text-zinc-400">{me ? a.lockedOther : a.noWalletReserve}</p>;
      }

      case Status.Reserved: {
        const afterDeadline = now > moveIn;
        const canFinalize = now > moveIn + rw;
        if (role === "landlord")
          return (
            <>
              {L.conditionHash !== zeroHash && mode !== "report" ? (
                <>
                  <p className="text-sm text-zinc-300">{a.reportSent}</p>
                  <Button variant="secondary" className="w-full" onClick={() => setMode("report")}>
                    {a.redoReport}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-300">{a.reportIntro}</p>
                  <ReportBuilder
                    leaseId={id.toString()}
                    busy={busy === "condition"}
                    onSubmit={(hash) => run("condition", () => call("proposeCondition", [id, hash]), a.reportSentToast)}
                  />
                </>
              )}
              <Countdown until={moveIn} now={now} before={a.moveInIn} after={a.moveInPassed} />
              {afterDeadline && (
                <Button variant="danger" className="w-full" loading={busy === "noshow"} onClick={() => run("noshow", () => call("claimNoShow", [id]), a.noShowToast)}>
                  {a.claimNoShow}
                </Button>
              )}
              {refundHoldBtn(a.refundHold)}
              {canFinalize && finalizeBtn(a.finalizeRefundHold, a.holdRefunded)}
            </>
          );
        if (role === "tenant") {
          const topUp = L.depositAmount - L.holdAmount;
          return (
            <>
              {L.conditionHash === zeroHash ? (
                <p className="text-sm text-zinc-300">{a.waitReport}</p>
              ) : (
                <>
                  <p className="text-sm text-zinc-300">{a.checkReport(<Money x={topUp} />)}</p>
                  {L.landlordYieldOptIn && (
                    <label className="flex items-start gap-3 rounded-none bg-zinc-900 p-3 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={acceptYield} onChange={(e) => setAcceptYield(e.target.checked)} />
                      <span>{a.acceptYield}</span>
                    </label>
                  )}
                  {needFunds(topUp)}
                  <Button
                    className="w-full text-base"
                    loading={busy === "movein"}
                    onClick={() =>
                      run(
                        "movein",
                        async () =>
                          call("confirmMoveInWithAuthorization", [
                            id,
                            L.conditionHash,
                            acceptYield && L.landlordYieldOptIn,
                            topUp > 0n ? await signDepositAuth(signer!, topUp) : EMPTY_AUTH,
                          ]),
                        a.movedIn,
                      )
                    }
                  >
                    {a.confirmMoveIn}
                  </Button>
                </>
              )}
              <Countdown until={moveIn} now={now} before={a.handOverIn} after={a.handOverLate} />
              {canFinalize && finalizeBtn(a.reclaimHold, a.reclaimed)}
              <Button
                variant="ghost"
                className="w-full"
                loading={busy === "back"}
                onClick={async () => {
                  if (await ask({ title: a.backOut, body: a.backOutConfirm, confirm: a.backOutYes, danger: true }))
                    run("back", () => call("cancelReservation", [id]), a.backedOut);
                }}
              >
                {a.backOut}
              </Button>
            </>
          );
        }
        return (
          <>
            <p className="text-sm text-zinc-400">{a.waitingMoveIn}</p>
            {canFinalize && me && finalizeBtn(a.finalizeRefundHold, a.holdRefunded)}
          </>
        );
      }

      case Status.NoShowClaimed: {
        const by = actionAt + rw;
        return (
          <>
            <p className="text-sm text-zinc-300">{a.noShowBody}</p>
            <Countdown until={by} now={now} before={a.tenantHas} after={a.objectionClosed} />
            {role === "tenant" && now <= by && (
              <EvidenceForm
                leaseId={id.toString()}
                role="tenant"
                placeholder={a.noShowPlaceholder}
                submitLabel={a.object}
                busy={busy === "dispute"}
                onSubmit={(h) => run("dispute", () => call("dispute", [id, h]), a.disputeSent)}
              />
            )}
            {role === "landlord" && refundHoldBtn(a.withdrawNoShow)}
            {now > by && me && finalizeBtn(a.finalizeToLandlord, a.settled)}
          </>
        );
      }

      case Status.Active: {
        if (role === "tenant")
          return (
            <>
              <p className="text-sm text-zinc-300">{a.activeTenant(Math.round(rw / 60))}</p>
              <Button className="w-full" loading={busy === "release"} onClick={() => run("release", () => call("requestRelease", [id]), a.releaseRequested)}>
                {a.requestRelease}
              </Button>
            </>
          );
        if (role === "landlord") return settlementForm();
        return <p className="text-sm text-zinc-400">{a.activeOther}</p>;
      }

      case Status.ReleaseRequested: {
        const by = actionAt + rw;
        return (
          <>
            <p className="text-sm text-zinc-300">{a.releaseBody}</p>
            <Countdown until={by} now={now} before={a.landlordHas} after={a.landlordLate} />
            {role === "landlord" && now <= by && settlementForm()}
            {now > by && me && finalizeBtn(a.finalizeFullRefund, a.fullRefunded)}
          </>
        );
      }

      case Status.SettlementProposed: {
        const by = actionAt + rw;
        const rest = L.balance > L.proposedDeduction ? L.balance - L.proposedDeduction : 0n;
        return (
          <>
            <p className="text-sm text-zinc-300">{a.proposedBody(<Money x={L.proposedDeduction} />)}</p>
            <Countdown until={by} now={now} before={a.tenantHas} after={a.replyClosed} />
            {role === "tenant" && now <= by && (
              <>
                <Button className="w-full" loading={busy === "accept"} onClick={() => run("accept", () => call("acceptSettlement", [id]), a.accepted)}>
                  {a.accept(fmtVnd(rest, loc))}
                </Button>
                {mode !== "dispute" ? (
                  <Button variant="danger" className="w-full" onClick={() => setMode("dispute")}>
                    {a.reject}
                  </Button>
                ) : (
                  <EvidenceForm
                    leaseId={id.toString()}
                    role="tenant"
                    placeholder={a.rejectPlaceholder}
                    submitLabel={a.rejectSubmit}
                    busy={busy === "dispute"}
                    onSubmit={(h) => run("dispute", () => call("dispute", [id, h]), a.rejected)}
                  />
                )}
              </>
            )}
            {now > by && me && finalizeBtn(a.finalizeAsProposed, a.settled)}
          </>
        );
      }

      case Status.Disputed: {
        const by = actionAt + mt;
        const ai = aiReport;
        const toTenant = (L.balance * BigInt(toTenantPct)) / 100n;
        return (
          <>
            <p className="text-sm text-zinc-300">{a.disputedBody(<Money x={L.balance} />)}</p>
            <Countdown until={by} now={now} before={a.mediatorHas} after={a.mediatorLate} />
            {role === "mediator" && (
              <div className="space-y-3 rounded-none border border-zinc-800 p-3">
                <p className="text-sm font-semibold">{a.ruling}</p>
                {ai && (
                  <button
                    type="button"
                    onClick={() => {
                      setToTenantPct(Math.round((100 - ai.suggestedDeductionPct) / 5) * 5);
                      if (!rulingText.trim()) setRulingText(a.aiRulingText(ai.suggestedDeductionPct, ai.summary));
                    }}
                    className="flex w-full animate-fade-up items-center gap-2 border border-dashed border-brand-500/60 bg-brand-500/5 px-3 py-2 text-left text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/15"
                  >
                    <Icon name="sparkles" className="h-4 w-4 shrink-0" />
                    {a.useAi(ai.suggestedDeductionPct)}
                  </button>
                )}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={toTenantPct}
                  onChange={(e) => setToTenantPct(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-sm">
                  <span>
                    {a.toTenant}: <b>{fmtVnd(toTenant, loc)}</b>
                  </span>
                  <span>
                    {a.toLandlord}: <b>{fmtVnd(L.balance - toTenant, loc)}</b>
                  </span>
                </div>
                <textarea className={inputCls} rows={3} placeholder={a.rulingPlaceholder} value={rulingText} onChange={(e) => setRulingText(e.target.value)} />
                <Button
                  className="w-full"
                  loading={busy === "resolve"}
                  disabled={!rulingText.trim()}
                  onClick={() => run("resolve", async () => call("resolve", [id, toTenant, await makeRuling(id.toString(), rulingText.trim(), toTenant)]), a.ruled)}
                >
                  {a.rule}
                </Button>
                <p className="text-xs text-zinc-400">{a.mediatorNote}</p>
              </div>
            )}
            {now > by && me && finalizeBtn(a.finalizeSplit, a.split)}
          </>
        );
      }

      case Status.Closed:
        return <p className="text-sm text-zinc-300">{a.closedBody}</p>;
      case Status.Cancelled:
        return <p className="text-sm text-zinc-300">{a.cancelledBody}</p>;
      default:
        return <p className="text-sm text-zinc-400">{a.unknown}</p>;
    }
  })();

  return (
    <Card className="space-y-3 border-brand-500/40 ring-4 ring-brand-500/10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">{a.todo}</h2>
        <span data-embed-hide className="text-right text-xs font-medium text-zinc-400">{t.roles[role]}</span>
      </div>
      {body}
      {role === "tenant" && L.status === Status.Reserved && L.conditionHash !== zeroHash && (
        <div className="border-t border-zinc-800 pt-4">
          <ReportView hash={L.conditionHash} />
        </div>
      )}
    </Card>
  );
}
