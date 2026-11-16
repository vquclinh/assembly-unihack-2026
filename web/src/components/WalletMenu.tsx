"use client";

import { useEffect, useRef, useState } from "react";
import { D, explorerAddress } from "@/lib/config";
import { errorText } from "@/lib/errors";
import { fmtUsdc, shortAddr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useBalance } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { AppError } from "@/lib/errors";
import { useToast } from "./toast";
import { Button, cx, inputCls, Spinner } from "./ui";

export function useFaucet() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function claim(address: string, after?: () => void) {
    setBusy(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = await res.json();
      if (!res.ok) throw new AppError(json.error || "Unknown", json.detail);
      toast({ tone: "good", text: t.wallet.faucetOk, tx: json.hash });
      after?.();
    } catch (e) {
      toast({ tone: "bad", text: t.wallet.faucetFail(errorText(t, e)) });
    } finally {
      setBusy(false);
    }
  }
  return { claim, busy };
}

export function WalletMenu() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { t } = useI18n();
  const loc = t.locale;
  const { data: balance, refresh } = useBalance(w.active?.address);
  const faucet = useFaucet();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!w.ready) return <Spinner className="text-stone-400" />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-50"
        aria-expanded={open}
      >
        {w.active ? (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="max-w-[9rem] truncate">{w.active.label}</span>
            <span className="hidden text-stone-500 sm:inline">{balance !== undefined ? fmtUsdc(balance, loc) : ""}</span>
          </>
        ) : (
          t.wallet.create
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
          {w.active && (
            <div className="mb-4 rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-500">{t.wallet.active}</p>
              <p className="font-semibold">{w.active.label}</p>
              <button
                className="mt-0.5 font-mono text-xs text-stone-600 hover:underline"
                onClick={() => {
                  navigator.clipboard?.writeText(w.active!.address);
                  toast({ tone: "info", text: t.wallet.copied });
                }}
              >
                {shortAddr(w.active.address)} · {t.wallet.copy}
              </button>
              {explorerAddress(w.active.address) && (
                <a className="ml-2 text-xs text-stone-500 underline" href={explorerAddress(w.active.address)} target="_blank" rel="noreferrer">
                  {t.wallet.explorer}
                </a>
              )}
              <p className="mt-2 text-sm">
                {t.wallet.balance}: <b>{balance !== undefined ? fmtUsdc(balance, loc) : "…"}</b>
              </p>
              {D.mockToken && (
                <Button variant="secondary" className="mt-2 w-full" loading={faucet.busy} onClick={() => faucet.claim(w.active!.address, refresh)}>
                  {t.wallet.faucet}
                </Button>
              )}
            </div>
          )}

          {w.accounts.length > 1 && (
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{t.wallet.switch}</p>
              <ul className="space-y-1">
                {w.accounts.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => {
                        w.select(a.id);
                        setOpen(false);
                      }}
                      className={cx(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100",
                        a.id === w.active?.id && "bg-emerald-50 font-semibold text-emerald-900",
                      )}
                    >
                      <span className="truncate">{a.label}</span>
                      <span className="font-mono text-xs text-stone-500">{shortAddr(a.address)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{t.wallet.add}</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              w.createQuick(label.trim() || t.wallet.defaultName(w.accounts.length + 1));
              setLabel("");
              toast({ tone: "good", text: t.wallet.created });
            }}
          >
            <input className={inputCls} placeholder={t.wallet.namePlaceholder} value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button type="submit" className="shrink-0">
              {t.wallet.createButton}
            </Button>
          </form>
          <p className="mt-1.5 text-xs text-stone-500">{t.wallet.quickHint}</p>
          {w.hasInjected && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() =>
                w.connectInjected(t.wallet.browserWallet).catch((e) => toast({ tone: "bad", text: errorText(t, e) }))
              }
            >
              {t.wallet.connect}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
