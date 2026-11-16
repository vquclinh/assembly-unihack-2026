"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type Address, parseEventLogs, zeroHash } from "viem";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Eyebrow, Spinner, cx } from "@/components/ui";
import { chainNow, publicClient } from "@/lib/client";
import { D, escrowAbi, isDeployed } from "@/lib/config";
import { errorText } from "@/lib/errors";
import { uploadJson, uploadPhoto } from "@/lib/files";
import { vndToUsdc } from "@/lib/format";
import { useLease } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { Status, type Terms } from "@/lib/lease";
import { relayEscrowCall } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

type Role = "landlord" | "tenant" | "mediator";
const ROLES: Role[] = ["landlord", "tenant", "mediator"];
const STORE = "coc.demo.v1";
type DemoState = { wallets: Record<Role, string>; leaseId?: string };

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

/** Who acts next, and which narration key describes it. */
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

export default function DemoPage() {
  const t = useT();
  const d = t.demo;
  const w = useWallet();
  const toast = useToast();
  const [state, setState] = useState<DemoState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [setupStep, setSetupStep] = useState(-1);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    const s = loadState();
    // Forget demo wallets that were deleted from this browser.
    if (s && w.ready && ROLES.every((r) => w.accounts.some((a) => a.id === s.wallets[r]))) setState(s);
    if (w.ready) setLoaded(true);
  }, [w.ready, w.accounts]);

  const leaseId = state?.leaseId ? BigInt(state.leaseId) : null;
  const { data: snap } = useLease(leaseId);

  function wallet(role: Role) {
    return w.accounts.find((a) => a.id === state?.wallets[role]);
  }

  async function createLease(s: DemoState) {
    const landlord = w.accounts.find((a) => a.id === s.wallets.landlord) ?? null;
    const mediator = w.accounts.find((a) => a.id === s.wallets.mediator) ?? null;
    const landlordAddr = landlord?.address ?? (s as DemoState & { addrs?: Record<Role, Address> }).addrs?.landlord;
    const mediatorAddr = mediator?.address ?? (s as DemoState & { addrs?: Record<Role, Address> }).addrs?.mediator;
    if (!landlordAddr || !mediatorAddr) throw new Error("NoWallet");

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
    const signer = { address: landlordAddr, signTypedData: (p: Parameters<typeof w.signTypedData>[0]) => w.signTypedDataAs(s.wallets.landlord, p) };
    const hash = await relayEscrowCall(signer, "createOffer", [
      "0x0000000000000000000000000000000000000000",
      mediatorAddr,
      vndToUsdc(terms.holdVnd),
      vndToUsdc(terms.depositVnd),
      BigInt(now + 10 * 60),
      BigInt(now + 30 * 60),
      true,
      termsHash,
    ]);
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "OfferCreated", logs: receipt.logs });
    const id = (ev as unknown as { args: { id: bigint } }).args.id;
    const next = { wallets: s.wallets, leaseId: id.toString() };
    saveState(next);
    setState(next);
    setFrameKey((k) => k + 1);
    toast({ tone: "good", text: t.create.created, tx: hash });
  }

  async function start() {
    try {
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

      setSetupStep(1);
      // The tenant pays the deposit; the mediator pays for the AI report.
      for (const who of [addrs.tenant, addrs.mediator]) {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: who }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          // A wallet that already has enough test USDC is fine.
          if (json.error !== "FaucetEnough") throw new Error(json.error || "FaucetFailed");
        }
      }
      await createLease({ ...s, addrs } as DemoState);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setSetupStep(-1);
    }
  }

  function reset() {
    saveState(null);
    setState(null);
  }

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;
  if (!loaded) return <Spinner className="text-zinc-500" />;

  const L = snap?.lease;
  const ph = L ? phase(L.status, L.conditionHash !== zeroHash) : null;

  return (
    // On wide screens the three panels use the whole window, not the 72rem page column.
    <div className="space-y-6 lg:relative lg:left-1/2 lg:w-[calc(100vw-3rem)] lg:max-w-[112rem] lg:-translate-x-1/2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-3">{d.eyebrow}</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{d.title}</h1>
          <p className="mt-3 max-w-3xl text-zinc-400">{d.lead}</p>
        </div>
        {state?.leaseId && (
          <div className="flex gap-2">
            <Button variant="secondary" loading={setupStep >= 0} onClick={start}>
              {d.restart}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {d.reset}
            </Button>
          </div>
        )}
      </div>

      {!state?.leaseId && (
        <div className="border border-zinc-800 border-t-2 border-t-brand-500 bg-surface p-6">
          <ol className="mb-6 grid gap-3 sm:grid-cols-4">
            {d.setup.map((label, i) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  className={cx(
                    "grid h-6 w-6 shrink-0 place-items-center font-mono text-xs font-bold",
                    setupStep > i ? "bg-brand-500 text-white" : setupStep === i ? "border border-brand-500 text-brand-400" : "border border-zinc-700 text-zinc-500",
                  )}
                >
                  {setupStep > i ? <Icon name="check" className="h-3.5 w-3.5" /> : setupStep === i ? <Spinner className="h-3 w-3" /> : i + 1}
                </span>
                <span className={setupStep >= i ? "text-zinc-100" : "text-zinc-500"}>{label}</span>
              </li>
            ))}
          </ol>
          <Button className="px-8 text-base" loading={setupStep >= 0} onClick={start}>
            {d.start}
            <Icon name="arrowRight" className="h-4 w-4" />
          </Button>
          {!D.mockToken && <p className="mt-3 text-sm text-amber-300">{d.needTestnet}</p>}
        </div>
      )}

      {state?.leaseId && ph && (
        <div className="flex flex-col gap-3 border border-brand-500/50 bg-brand-500/10 p-4 sm:flex-row sm:items-center">
          <span className="shrink-0 font-mono text-xs font-bold uppercase tracking-widest text-brand-400">{d.step(ph.step, 8)}</span>
          <p className="flex-1 text-sm font-medium text-white">{d.phases[ph.key]}</p>
          <p className="shrink-0 text-xs text-zinc-400">{d.deadlineNote}</p>
        </div>
      )}

      {state?.leaseId && (
        <div className="grid gap-4 lg:grid-cols-3">
          {ROLES.map((role) => {
            const acc = wallet(role);
            const mine = ph && (ph.actor === role || ph.actor === "all");
            const src = `/l/${state.leaseId}?embed=1&as=${state.wallets[role]}`;
            return (
              <section key={role} className={cx("flex flex-col border bg-canvas transition-colors", mine ? "border-brand-500 shadow-[6px_6px_0_0_var(--color-brand-500)]" : "border-zinc-800")}>
                <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white">{d.roles[role]}</p>
                    <p className="truncate font-mono text-[11px] text-zinc-500">{acc?.address}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cx("font-mono text-[10px] font-bold uppercase tracking-wider", mine ? "text-brand-400" : "text-zinc-600")}>
                      {mine ? d.yourTurn : d.waiting}
                    </span>
                    <a href={`/l/${state.leaseId}?as=${state.wallets[role]}`} target="_blank" rel="noreferrer" title={d.openTab} className="text-zinc-500 hover:text-white">
                      <Icon name="link" className="h-4 w-4" />
                    </a>
                  </div>
                </header>
                <iframe key={`${frameKey}-${role}`} src={src} title={d.roles[role]} className="h-[78vh] min-h-[560px] w-full bg-canvas" />
              </section>
            );
          })}
        </div>
      )}

      {state?.leaseId && L && (L.status === Status.Closed || L.status === Status.Cancelled) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-zinc-400">{d.after}</span>
          <Link className="font-semibold text-brand-400 hover:text-brand-300" href="/stats">
            {d.links.stats} →
          </Link>
          {/* A full page load, so the profile opens signed in as the demo landlord. */}
          <a className="font-semibold text-brand-400 hover:text-brand-300" href={`/u/${L.landlord}?as=${state.wallets.landlord}`}>
            {d.links.landlord} →
          </a>
          <Link className="font-semibold text-brand-400 hover:text-brand-300" href="/rooms">
            {d.links.rooms} →
          </Link>
        </div>
      )}
    </div>
  );
}
