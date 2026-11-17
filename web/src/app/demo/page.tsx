"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, type Hex, parseEventLogs, zeroAddress, zeroHash } from "viem";
import { makeRuling } from "@/components/docs";
import { DemoCursor, type DemoCursorHandle } from "@/components/DemoCursor";
import { Icon, type IconName } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Eyebrow, Spinner, cx } from "@/components/ui";
import { aiQuote, buyAiReport } from "@/lib/aiPay";
import { chainNow, publicClient } from "@/lib/client";
import { D, ESCROW, escrowAbi, isDeployed } from "@/lib/config";
import { AppError, errorText } from "@/lib/errors";
import { uploadJson, uploadPhoto } from "@/lib/files";
import { fmtUsdc, vndToUsdc } from "@/lib/format";
import { useLease } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { type Lease, Status, type Terms } from "@/lib/lease";
import { sampleConditionReport, sampleEvidence } from "@/lib/samples";
import { EMPTY_AUTH, lookupTx, relayEscrowCall, signDepositAuth } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

type Role = "landlord" | "tenant" | "mediator";
type Actor = Role | "keeper";
type Scenario = "happy" | "dispute" | "ghost";
type Mode = "auto" | "manual";
const ROLES: Role[] = ["landlord", "tenant", "mediator"];
const SCENARIOS: Scenario[] = ["happy", "dispute", "ghost"];
const STORE = "coc.demo.v2";
type DemoState = { wallets: Record<Role, string>; leaseId?: string; scenario?: Scenario; mode?: Mode };

/** Deadlines per story. The ghost story needs a move-in deadline that passes while you watch. */
const PLAN: Record<Scenario, { moveIn: number; leaseEnd: number; windows: [number, number] }> = {
  happy: { moveIn: 20 * 60, leaseEnd: 45 * 60, windows: [120, 180] },
  dispute: { moveIn: 20 * 60, leaseEnd: 45 * 60, windows: [120, 180] },
  ghost: { moveIn: 40, leaseEnd: 30 * 60, windows: [30, 60] },
};

type StepKey = "reserve" | "report" | "moveIn" | "release" | "fullReturn" | "deduct" | "dispute" | "ai" | "rule" | "ghostWait" | "keeper";
const STEPS: Record<Scenario, StepKey[]> = {
  happy: ["reserve", "report", "moveIn", "release", "fullReturn"],
  dispute: ["reserve", "report", "moveIn", "release", "deduct", "dispute", "ai", "rule"],
  ghost: ["reserve", "ghostWait", "keeper"],
};
const ACTOR: Record<StepKey, Actor> = {
  reserve: "tenant",
  report: "landlord",
  moveIn: "tenant",
  release: "tenant",
  fullReturn: "landlord",
  deduct: "landlord",
  dispute: "tenant",
  ai: "mediator",
  rule: "mediator",
  ghostWait: "keeper",
  keeper: "keeper",
};
const ACTOR_ICON: Record<Actor, IconName> = { landlord: "home", tenant: "userCheck", mediator: "scale", keeper: "clock" };

function loadState(): DemoState | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "null") as DemoState | null;
  } catch {
    return null;
  }
}
function saveState(s: DemoState | null) {
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch {}
}

/** Who acts next in the click-through mode, and which narration key describes it. */
function phase(status: number, hasReport: boolean): { key: string; actor: Role | "all"; step: number } {
  switch (status) {
    case Status.Offered:
      return { key: "offered", actor: "tenant", step: 1 };
    case Status.Reserved:
      return hasReport ? { key: "reservedReport", actor: "tenant", step: 3 } : { key: "reserved", actor: "landlord", step: 2 };
    case Status.NoShowClaimed:
      return { key: "noShow", actor: "tenant", step: 3 };
    case Status.Active:
      return { key: "active", actor: "tenant", step: 4 };
    case Status.ReleaseRequested:
      return { key: "releaseRequested", actor: "landlord", step: 5 };
    case Status.SettlementProposed:
      return { key: "settlementProposed", actor: "tenant", step: 6 };
    case Status.Disputed:
      return { key: "disputed", actor: "mediator", step: 7 };
    case Status.Cancelled:
      return { key: "cancelled", actor: "all", step: 8 };
    default:
      return { key: "closed", actor: "all", step: 8 };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readLease = (id: bigint) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getLease", args: [id] }) as Promise<Lease>;

type Run = { status: "idle" | "playing" | "paused" | "done" | "error"; index: number; times: Record<number, number>; error?: string; waitLeft?: number; outcome?: [bigint, bigint] };

export default function DemoPage() {
  const { t, lang } = useI18n();
  const d = t.demo;
  const w = useWallet();
  const toast = useToast();
  const [state, setState] = useState<DemoState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [setupStep, setSetupStep] = useState(-1);
  const [frameKey, setFrameKey] = useState(0);
  const [mode, setMode] = useState<Mode>("auto");
  const [scenario, setScenario] = useState<Scenario>("dispute");
  const [run, setRun] = useState<Run>({ status: "idle", index: 0, times: {} });
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const cursorRef = useRef<DemoCursorHandle>(null);

  useEffect(() => {
    const s = loadState();
    // Forget demo wallets that were deleted from this browser.
    if (s && w.ready && ROLES.every((r) => w.accounts.some((a) => a.id === s.wallets[r]))) {
      setState(s);
      if (s.mode) setMode(s.mode);
      if (s.scenario) setScenario(s.scenario);
    }
    if (w.ready) setLoaded(true);
  }, [w.ready, w.accounts]);

  const leaseId = state?.leaseId ? BigInt(state.leaseId) : null;
  const { data: snap, refresh } = useLease(leaseId);

  const wallet = (role: Role) => w.accounts.find((a) => a.id === state?.wallets[role]);
  // Addresses of wallets created during this click, before React state has caught up.
  const addrRef = useRef<Partial<Record<Role, Address>>>({});
  const signer = useCallback(
    (s: DemoState, role: Role) => {
      const address = w.accounts.find((a) => a.id === s.wallets[role])?.address ?? addrRef.current[role];
      if (!address) throw new AppError("NoWallet");
      return { address, signTypedData: (p: Parameters<typeof w.signTypedDataAs>[1]) => w.signTypedDataAs(s.wallets[role], p) };
    },
    [w],
  );

  /** Tells the three panels to reload now instead of at their next poll. */
  function pokeFrames() {
    document.querySelectorAll("iframe[data-demo]").forEach((f) => (f as HTMLIFrameElement).contentWindow?.postMessage("coc:refresh", window.location.origin));
    refresh();
  }

  async function createLease(s: DemoState, addrs: Record<Role, Address>, story: Scenario) {
    setSetupStep(2);
    const photo = new File([await (await fetch("/demo/room.jpg")).blob()], "room.jpg", { type: "image/jpeg" });
    const terms: Terms = {
      kind: "terms",
      v: 1,
      title: d.sampleTitle,
      address: d.sampleAddress,
      rentVnd: 3_200_000,
      depositVnd: 3_000_000,
      holdVnd: 500_000,
      notes: d.sampleNotes,
      listed: true,
      photos: [await uploadPhoto(photo)],
      createdAt: new Date().toISOString(),
    };
    const termsHash = await uploadJson(terms);

    setSetupStep(3);
    const now = await chainNow();
    const plan = PLAN[story];
    const hash = await relayEscrowCall(signer(s, "landlord"), "createOfferWithWindows", [
      zeroAddress,
      addrs.mediator,
      vndToUsdc(terms.holdVnd),
      vndToUsdc(terms.depositVnd),
      BigInt(now + plan.moveIn),
      BigInt(now + plan.leaseEnd),
      true,
      termsHash,
      plan.windows[0],
      plan.windows[1],
    ]);
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "OfferCreated", logs: receipt.logs });
    const id = (ev as unknown as { args: { id: bigint } }).args.id;
    const next: DemoState = { wallets: s.wallets, leaseId: id.toString(), scenario: story, mode };
    saveState(next);
    setState(next);
    setFrameKey((k) => k + 1);
    toast({ tone: "good", text: t.create.created, tx: hash });
    return next;
  }

  async function start() {
    try {
      setRun({ status: "idle", index: 0, times: {} });
      setSetupStep(0);
      let s = state;
      const addrs = {} as Record<Role, Address>;
      if (!s) {
        const ids = {} as Record<Role, string>;
        for (const r of ROLES) {
          const acc = w.createQuick(d.walletLabels[r]);
          ids[r] = acc.id;
          addrs[r] = acc.address;
        }
        s = { wallets: ids };
        saveState(s);
      } else {
        for (const r of ROLES) addrs[r] = w.accounts.find((a) => a.id === s!.wallets[r])!.address;
      }
      addrRef.current = addrs;

      setSetupStep(1);
      // The tenant pays the deposit; the mediator pays for the AI report.
      await Promise.all(
        [addrs.tenant, addrs.mediator].map(async (who) => {
          const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: who }) });
          if (!res.ok) {
            const json = (await res.json()) as { error?: string; detail?: string };
            // A wallet that already has enough test USDC is fine.
            if (json.error !== "FaucetEnough") throw new AppError(json.error || "FaucetFailed", json.detail);
          }
        }),
      );
      const next = await createLease(s, addrs, scenario);
      setSetupStep(-1);
      if (mode === "auto") play(next, 0);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setSetupStep(-1);
    }
  }

  /** Runs one step of a story as the right person. Returns the transaction, if any. */
  async function doStep(s: DemoState, key: StepKey, onWait: (left: number) => void): Promise<Hex | null> {
    const id = BigInt(s.leaseId!);
    const L = await readLease(id);
    const call = (role: Role, fn: string, args: readonly unknown[]) => relayEscrowCall(signer(s, role), fn, args);
    switch (key) {
      case "reserve":
        return call("tenant", "reserveWithAuthorization", [id, await signDepositAuth(signer(s, "tenant"), L.holdAmount)]);
      case "report":
        return call("landlord", "proposeCondition", [id, await sampleConditionReport(s.leaseId!, t.docs.defaultItems, t.docs.sampleNotes)]);
      case "moveIn": {
        const topUp = L.depositAmount - L.holdAmount;
        return call("tenant", "confirmMoveInWithAuthorization", [id, L.conditionHash, true, topUp > 0n ? await signDepositAuth(signer(s, "tenant"), topUp) : EMPTY_AUTH]);
      }
      case "release":
        return call("tenant", "requestRelease", [id]);
      case "fullReturn":
        return call("landlord", "proposeSettlement", [id, 0n, zeroHash]);
      case "deduct":
        return call("landlord", "proposeSettlement", [id, (L.depositAmount * 30n) / 100n, await sampleEvidence(s.leaseId!, "landlord", t.docs.sampleLandlordText)]);
      case "dispute":
        return call("tenant", "dispute", [id, await sampleEvidence(s.leaseId!, "tenant", t.docs.sampleTenantText)]);
      case "ai": {
        const q = await aiQuote(s.leaseId!);
        if (q.report) return q.report.payment.tx;
        if (!q.req) throw new AppError(q.error ?? "Unknown");
        const report = await buyAiReport(signer(s, "mediator"), s.leaseId!, q.req, lang);
        return report.payment.tx;
      }
      case "rule": {
        const q = await aiQuote(s.leaseId!);
        const pct = q.report ? q.report.suggestedDeductionPct : 50;
        const toTenant = (L.balance * BigInt(100 - pct)) / 100n;
        return call("mediator", "resolve", [id, toTenant, await makeRuling(s.leaseId!, d.rulingText, toTenant)]);
      }
      case "ghostWait": {
        const due = Number(L.moveInDeadline) + Number(L.responseWindow) + 2;
        // Count down on the local clock, offset to chain time once (an idle chain makes no new blocks).
        const offset = (await chainNow()) - Date.now() / 1000;
        for (;;) {
          const left = Math.ceil(due - (Date.now() / 1000 + Math.max(offset, 0)));
          if (left <= 0) return null;
          onWait(left);
          await sleep(500);
        }
      }
      case "keeper": {
        for (let i = 0; i < 20; i++) {
          const res = await fetch("/api/keeper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.leaseId }) });
          const j = (await res.json()) as { results?: { ok: boolean; tx?: Hex }[]; error?: string };
          const done = j.results?.find((x) => x.ok);
          if (done?.tx) return done.tx;
          if ((await readLease(id)).status !== Status.Reserved) return null;
          await sleep(3000);
        }
        throw new AppError("TooEarly");
      }
    }
  }

  async function finalOutcome(id: string, hashes: Hex[]): Promise<[bigint, bigint] | undefined> {
    try {
      const L = await readLease(BigInt(id));
      // First choice: the Paid events in this run's own transactions, straight from the chain.
      let tenant = 0n;
      let landlord = 0n;
      const receipts = await Promise.all(hashes.map((hash) => publicClient.getTransactionReceipt({ hash }).catch(() => null)));
      for (const r of receipts) {
        if (!r) continue;
        const logs = r.logs.filter((l) => l.address.toLowerCase() === ESCROW.toLowerCase());
        for (const e of parseEventLogs({ abi: escrowAbi, eventName: "Paid", logs })) {
          const a = e.args as { id: bigint; to: Address; amount: bigint };
          if (a.id !== BigInt(id)) continue;
          if (a.to.toLowerCase() === L.tenant.toLowerCase()) tenant += a.amount;
          else if (a.to.toLowerCase() === L.landlord.toLowerCase()) landlord += a.amount;
        }
      }
      if (tenant + landlord > 0n) return [tenant, landlord];
      // Payments can take a moment to show up in the event index: retry a few times.
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(`/api/history/${id}?fresh=1`);
        const { events } = (await res.json()) as { events: { name: string; args: Record<string, string> }[] };
        tenant = 0n;
        landlord = 0n;
        for (const e of events) {
          if (e.name !== "Paid") continue;
          if (e.args.to.toLowerCase() === L.tenant.toLowerCase()) tenant += BigInt(e.args.amount);
          else if (e.args.to.toLowerCase() === L.landlord.toLowerCase()) landlord += BigInt(e.args.amount);
        }
        if (tenant + landlord > 0n || attempt === 3) return [tenant, landlord];
        await sleep(2500);
      }
    } catch {
      return undefined;
    }
  }

  async function play(s: DemoState, from: number) {
    if (runningRef.current || !s.scenario) return;
    runningRef.current = true;
    pausedRef.current = false;
    const steps = STEPS[s.scenario];
    const hashes: Hex[] = [];
    setRun((r) => ({ ...r, status: "playing", index: from, error: undefined }));
    try {
      for (let i = from; i < steps.length; i++) {
        setRun((r) => ({ ...r, index: i, waitLeft: undefined }));
        while (pausedRef.current) await sleep(300);
        const actor = ACTOR[steps[i]];
        let release = () => {};
        if (actor === "keeper") cursorRef.current?.hide();
        else release = (await cursorRef.current?.press(() => document.querySelector<HTMLIFrameElement>(`iframe[data-role="${actor}"]`), steps[i], d.roles[actor], i === from ? 25000 : 6000)) ?? release;
        const started = Date.now();
        const tx = await doStep(s, steps[i], (left) => setRun((r) => ({ ...r, waitLeft: left }))).finally(release);
        if (tx) hashes.push(tx);
        const took = (tx && lookupTx(tx)?.ms) || Date.now() - started;
        setRun((r) => ({ ...r, times: { ...r.times, [i]: took } }));
        pokeFrames();
        // A short pause so people watching can follow what changed in the panels.
        await sleep(steps[i] === "ghostWait" ? 300 : 2200);
        while (pausedRef.current) await sleep(300);
      }
      cursorRef.current?.hide();
      const outcome = await finalOutcome(s.leaseId!, hashes);
      setRun((r) => ({ ...r, status: "done", index: steps.length, outcome }));
      pokeFrames();
    } catch (e) {
      cursorRef.current?.hide();
      setRun((r) => ({ ...r, status: "error", error: errorText(t, e) }));
    } finally {
      runningRef.current = false;
    }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setRun((r) => ({ ...r, status: pausedRef.current ? "paused" : "playing" }));
  }

  function reset() {
    saveState(null);
    setState(null);
    setRun({ status: "idle", index: 0, times: {} });
  }

  function newStory() {
    if (!state) return;
    const next = { wallets: state.wallets };
    saveState(next);
    setState(next);
    setRun({ status: "idle", index: 0, times: {} });
  }

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;
  if (!loaded) return <Spinner className="text-zinc-500" />;

  const L = snap?.lease;
  const ph = L ? phase(L.status, L.conditionHash !== zeroHash) : null;
  const auto = state?.mode === "auto" && !!state.scenario;
  const steps = state?.scenario ? STEPS[state.scenario] : [];
  const current = auto && run.status !== "done" && run.status !== "idle" ? steps[run.index] : undefined;
  const activeActor: Actor | undefined = auto ? (current ? ACTOR[current] : undefined) : ph?.actor === "all" ? undefined : ph?.actor;
  const progress = auto ? (run.status === "done" ? 100 : (run.index / Math.max(steps.length, 1)) * 100) : ph ? (ph.step / 8) * 100 : 0;

  return (
    // On wide screens the three panels use the whole window, not the 72rem page column.
    <div className="space-y-6 lg:relative lg:left-1/2 lg:w-[calc(100vw-3rem)] lg:max-w-[112rem] lg:-translate-x-1/2">
      <DemoCursor ref={cursorRef} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-3">{d.eyebrow}</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{d.title}</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">{d.lead}</p>
        </div>
        {state?.leaseId && (
          <div className="flex gap-2">
            <Button variant="secondary" disabled={run.status === "playing"} onClick={newStory}>
              {d.restart}
            </Button>
            <Button variant="ghost" disabled={run.status === "playing"} onClick={reset}>
              {d.reset}
            </Button>
          </div>
        )}
      </div>

      {!state?.leaseId && (
        <div className="animate-fade-up space-y-6 border border-zinc-800 border-t-2 border-t-brand-500 bg-surface p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["auto", "manual"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cx(
                  "flex items-start gap-3 border p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                  mode === m ? "border-brand-500 bg-brand-500/10 shadow-[4px_4px_0_0_var(--color-brand-500)]" : "border-zinc-700 hover:border-zinc-500",
                )}
              >
                <span className={cx("grid h-10 w-10 shrink-0 place-items-center", mode === m ? "bg-brand-500 text-white" : "bg-zinc-800 text-zinc-300")}>
                  <Icon name={m === "auto" ? "play" : "zap"} className="h-5 w-5" />
                </span>
                <span>
                  <b className="block text-white">{m === "auto" ? d.modeAuto : d.modeManual}</b>
                  <span className="text-sm text-zinc-400">{m === "auto" ? d.modeAutoBody : d.modeManualBody}</span>
                </span>
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-zinc-400">{d.scenarioTitle}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScenario(sc)}
                  aria-pressed={scenario === sc}
                  className={cx(
                    "border p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                    scenario === sc ? "border-white bg-white/5" : "border-zinc-800 hover:border-zinc-600",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cx("h-3 w-3 rounded-full border-2 transition-colors", scenario === sc ? "border-brand-500 bg-brand-500" : "border-zinc-600")} />
                    <b className="text-white">{d.scenarios[sc].title}</b>
                  </span>
                  <span className="mt-1 block text-sm text-zinc-400">{d.scenarios[sc].body}</span>
                </button>
              ))}
            </div>
          </div>

          {setupStep >= 0 && <ol className="grid animate-fade-in gap-3 sm:grid-cols-4">
            {d.setup.map((label, i) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  className={cx(
                    "grid h-6 w-6 shrink-0 place-items-center font-mono text-xs font-bold transition-colors duration-300",
                    setupStep > i ? "bg-brand-500 text-white" : setupStep === i ? "border border-brand-500 text-brand-400" : "border border-zinc-700 text-zinc-500",
                  )}
                >
                  {setupStep > i ? <Icon name="check" className="h-3.5 w-3.5 animate-pop" /> : setupStep === i ? <Spinner className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cx("transition-colors", setupStep >= i ? "text-zinc-100" : "text-zinc-500")}>{label}</span>
              </li>
            ))}
          </ol>}
          <Button className="px-8 text-base" loading={setupStep >= 0} onClick={start}>
            {mode === "auto" ? <Icon name="play" className="h-4 w-4" /> : null}
            {mode === "auto" ? d.play : d.start}
            {mode === "manual" && <Icon name="arrowRight" className="h-4 w-4" />}
          </Button>
          {!D.mockToken && <p className="text-sm text-amber-300">{d.needTestnet}</p>}
        </div>
      )}

      {state?.leaseId && (
        <div className="relative h-1 overflow-hidden bg-zinc-800">
          <div className="h-full bg-brand-500 transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
      )}

      {state?.leaseId && auto && (
        <div className="grid animate-fade-up gap-4 border border-brand-500/50 bg-brand-500/[0.07] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ol className="space-y-2">
            {steps.map((k, i) => {
              const done = run.index > i || run.status === "done";
              const now = i === run.index && (run.status === "playing" || run.status === "paused" || run.status === "error");
              return (
                <li key={k} className={cx("flex items-center gap-2.5 text-sm transition-opacity duration-300", !done && !now && "opacity-45")}>
                  <span
                    className={cx(
                      "grid h-6 w-6 shrink-0 place-items-center font-mono text-[11px] font-bold",
                      done ? "bg-emerald-500 text-white" : now ? (run.status === "error" ? "bg-brand-500 text-white" : "border border-brand-500 text-brand-400") : "border border-zinc-700 text-zinc-500",
                    )}
                  >
                    {done ? <Icon name="check" className="h-3.5 w-3.5 animate-pop" /> : now && run.status === "playing" ? <Spinner className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className={cx("flex-1", now ? "font-semibold text-white" : "text-zinc-300")}>{d.autoSteps[k]}</span>
                  {done && run.times[i] !== undefined && run.times[i] >= 50 && k !== "ghostWait" && (
                    <span title="Avalanche" className="flex shrink-0 animate-fade-in items-center gap-0.5 font-mono text-xs text-emerald-400">
                      <Icon name="bolt" className="h-3 w-3" />
                      {d.tookOn((run.times[i] / 1000).toFixed(1))}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col justify-between gap-4 border-t border-brand-500/30 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div key={`${run.index}-${run.status}`} className="animate-fade-up">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-400">
                {run.status === "done" ? d.finished : run.status === "paused" ? d.paused : run.status === "error" ? "Error" : d.playing}
                {run.status !== "done" && ` · ${Math.min(run.index + 1, steps.length)}/${steps.length}`}
              </p>
              {current && (
                <div className="mt-3 flex items-start gap-3">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center bg-brand-500 text-white">
                    {run.status === "playing" && <span className="absolute inset-0 animate-ring" />}
                    <Icon name={ACTOR_ICON[ACTOR[current]]} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{d.actor[ACTOR[current]]}</p>
                    <p className="text-xl font-bold leading-snug text-white">{d.autoSteps[current]}</p>
                  </div>
                </div>
              )}
              {current === "ghostWait" && run.waitLeft !== undefined && (
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums text-white">{d.waitLeft(run.waitLeft)}</p>
              )}
              {run.status === "done" && (
                <div className="mt-3 flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 animate-pop place-items-center bg-emerald-500 text-white">
                    <Icon name="check" className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xl font-bold text-white">{d.phases[L?.status === Status.Cancelled ? "cancelled" : "closed"]}</p>
                    {run.outcome && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(["tenant", "landlord"] as const).map((who, j) => (
                          <span key={who} className="animate-fade-up border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5">
                            <span className="block text-xs text-zinc-400">{d.roles[who]}</span>
                            <b className="font-mono text-emerald-300">{fmtUsdc(run.outcome![j], t.locale)}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {run.status === "error" && <p className="mt-3 text-sm text-rose-300">{run.error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {(run.status === "playing" || run.status === "paused") && (
                <Button variant="secondary" onClick={togglePause}>
                  <Icon name={run.status === "paused" ? "play" : "pause"} className="h-4 w-4" />
                  {run.status === "paused" ? d.resume : d.pause}
                </Button>
              )}
              {(run.status === "error" || run.status === "idle") && state && (
                <Button onClick={() => play(state, run.index)}>
                  <Icon name="play" className="h-4 w-4" />
                  {run.status === "error" ? t.pages.retry : d.play}
                </Button>
              )}
              {run.status === "done" && (
                <Button onClick={newStory}>
                  {d.replay}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {state?.leaseId && !auto && ph && (
        <div key={ph.key} className="flex animate-fade-up flex-col gap-3 border border-brand-500/50 bg-brand-500/10 p-4 sm:flex-row sm:items-center">
          <span className="shrink-0 font-mono text-xs font-bold uppercase tracking-widest text-brand-400">{d.step(ph.step, 8)}</span>
          <p className="flex-1 font-medium text-white">{d.phases[ph.key]}</p>
        </div>
      )}

      {state?.leaseId && (
        <div className="grid gap-4 lg:grid-cols-3">
          {ROLES.map((role) => {
            const acc = wallet(role);
            const mine = activeActor === role;
            const src = `/l/${state.leaseId}?embed=1&as=${state.wallets[role]}`;
            return (
              <section
                key={role}
                className={cx(
                  "flex flex-col border bg-canvas transition-all duration-500",
                  mine ? "border-brand-500 shadow-[6px_6px_0_0_var(--color-brand-500)] lg:-translate-y-1" : "border-zinc-800",
                )}
              >
                <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name={ACTOR_ICON[role]} className={cx("h-4 w-4 shrink-0", mine ? "text-brand-400" : "text-zinc-500")} />
                    <p className="font-bold text-white">{d.roles[role]}</p>
                    {acc && <span title={acc.address} className="font-mono text-xs text-zinc-500">{acc.address.slice(0, 6)}…{acc.address.slice(-4)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {mine && <span className="animate-pop bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">{d.yourTurn}</span>}
                    <a href={`/l/${state.leaseId}?as=${state.wallets[role]}`} target="_blank" rel="noreferrer" title={d.openTab} className="text-zinc-500 hover:text-white">
                      <Icon name="link" className="h-4 w-4" />
                    </a>
                  </div>
                </header>
                <iframe data-demo data-role={role} key={`${frameKey}-${role}`} src={src} title={d.roles[role]} className="h-[78vh] min-h-[560px] w-full bg-canvas" />
              </section>
            );
          })}
        </div>
      )}

      {state?.leaseId && L && (L.status === Status.Closed || L.status === Status.Cancelled) && (
        <div className="flex animate-fade-up flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-zinc-400">{d.after}</span>
          <Link className="font-semibold text-brand-400 hover:text-brand-300" href="/stats">
            {d.links.stats} →
          </Link>
          {/* A full page load, so the profile opens signed in as the demo landlord. */}
          <a className="font-semibold text-brand-400 hover:text-brand-300" href={`/u/${L.landlord}?as=${state.wallets.landlord}`}>
            {d.links.landlord} →
          </a>
          <Link className="font-semibold text-brand-400 hover:text-brand-300" href="/transparency">
            {t.nav.transparency} →
          </Link>
        </div>
      )}
    </div>
  );
}
