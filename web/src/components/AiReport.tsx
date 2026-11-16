"use client";

import { useEffect, useState } from "react";
import { type Address, type Hex, formatUnits, toHex } from "viem";
import { chainNow } from "@/lib/client";
import { chain, explorerTx } from "@/lib/config";
import { AppError, errorText } from "@/lib/errors";
import { fmtUsdc, shortAddr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AiReport } from "@/lib/lease";
import { useWallet } from "@/lib/wallet";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { Badge, Button, Card, cx } from "./ui";

type Requirements = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: Address;
  asset: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

const SEVERITY_TONE = { none: "good", minor: "warn", moderate: "warn", major: "bad" } as const;

/** AI damage assessment, bought per report over x402 and then shared with every party. */
export function AiReportCard({ leaseId, contested }: { leaseId: string; contested: bigint }) {
  const { t, lang } = useI18n();
  const a = t.ai;
  const w = useWallet();
  const toast = useToast();
  const [report, setReport] = useState<AiReport | null>(null);
  const [req, setReq] = useState<Requirements | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "paying" | "working">("idle");

  useEffect(() => {
    let alive = true;
    fetch(`/api/ai-report/${leaseId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!alive) return;
        if (res.ok && json.report) setReport(json.report);
        else if (res.status === 402) setReq(json.accepts?.[0] ?? null);
        else setUnavailable(json.error ?? "Unknown");
      })
      .catch(() => alive && setUnavailable("Unknown"));
    return () => {
      alive = false;
    };
  }, [leaseId]);

  async function buy() {
    if (!w.active || !req) return;
    setStage("paying");
    try {
      // x402 "exact" payment: an EIP-3009 authorization for exactly the quoted amount to the service.
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const validBefore = BigInt((await chainNow()) + req.maxTimeoutSeconds);
      const authorization = { from: w.active.address, to: req.payTo, value: req.maxAmountRequired, validAfter: "0", validBefore: validBefore.toString(), nonce };
      const signature = await w.signTypedData({
        domain: { name: req.extra.name, version: req.extra.version, chainId: chain.id, verifyingContract: req.asset },
        types: {
          ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "ReceiveWithAuthorization",
        message: { ...authorization, value: BigInt(req.maxAmountRequired), validAfter: 0n, validBefore },
      });
      const header = btoa(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { signature, authorization } }));
      setStage("working");
      const res = await fetch(`/api/ai-report/${leaseId}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-payment": header },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || !json.report) throw new AppError(json.error || "Unknown", json.detail);
      setReport(json.report);
      toast({ tone: "good", text: a.bought, tx: json.report.payment.tx });
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setStage("idle");
    }
  }

  return (
    <Card className="space-y-4 border-t-2 border-t-brand-500">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center border border-brand-500/40 bg-brand-500/10 text-brand-500">
          <Icon name="sparkles" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold">{a.title}</h2>
          <p className="text-sm text-zinc-400">{a.lead}</p>
        </div>
      </div>

      {!report && unavailable && <p className="text-sm text-zinc-400">{errorText(t, new AppError(unavailable))}</p>}

      {!report && req && (
        <div className="space-y-3 border border-zinc-800 bg-canvas p-4">
          <p className="flex items-center gap-2 font-mono text-xs text-zinc-300">
            <span className="bg-white px-1.5 py-0.5 font-bold text-zinc-900">402</span>
            {a.price(formatUnits(BigInt(req.maxAmountRequired), 6))}
          </p>
          <p className="text-xs text-zinc-500">
            {a.shared} {a.privacy}
          </p>
          <Button className="w-full" loading={stage !== "idle"} disabled={!w.active} onClick={buy}>
            {stage === "paying" ? a.paying : stage === "working" ? a.working : a.buy}
          </Button>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{a.summary}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-100">{report.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-px border border-zinc-800 bg-zinc-800">
            <div className="bg-canvas p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{a.suggestion}</p>
              <p className="mt-1 text-2xl font-extrabold text-white">{report.suggestedDeductionPct}%</p>
              <p className="font-mono text-xs text-zinc-400">≈ {fmtUsdc((contested * BigInt(report.suggestedDeductionPct)) / 100n, t.locale)}</p>
            </div>
            <div className="bg-canvas p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{a.confidence}</p>
              <p className="mt-1 text-2xl font-extrabold text-white">{a.confidences[report.confidence]}</p>
              <p className="truncate font-mono text-xs text-zinc-400">
                {a.model}: {report.model}
              </p>
            </div>
          </div>

          {report.findings.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">{a.findings}</p>
              <ul className="divide-y divide-zinc-800 border border-zinc-800">
                {report.findings.map((f, i) => (
                  <li key={i} className="space-y-1 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-white">{f.area}</b>
                      <span className="flex gap-1.5">
                        <Badge tone={f.preExisting === "yes" ? "good" : f.preExisting === "no" ? "bad" : "neutral"}>
                          {a.preExisting} {f.preExisting === "yes" ? a.yes : f.preExisting === "no" ? a.no : a.unclear}
                        </Badge>
                        <Badge tone={SEVERITY_TONE[f.severity]}>{a.severities[f.severity]}</Badge>
                      </span>
                    </div>
                    <p className="text-zinc-400">{f.observation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.caveats && (
            <p className="text-xs text-zinc-500">
              <b className="text-zinc-400">{a.caveats}:</b> {report.caveats}
            </p>
          )}
          <p className={cx("border-l-2 border-amber-400 bg-amber-500/10 px-3 py-2 text-xs text-amber-200")}>{a.advice}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {a.receipt}: {fmtUsdc(BigInt(report.payment.amount), t.locale)} · {a.paidBy} {shortAddr(report.payment.payer)} ·{" "}
            {explorerTx(report.payment.tx) ? (
              <a className="text-brand-400 hover:underline" href={explorerTx(report.payment.tx)} target="_blank" rel="noreferrer">
                {shortAddr(report.payment.tx as Hex)}
              </a>
            ) : (
              shortAddr(report.payment.tx)
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
