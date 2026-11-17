"use client";

import { useEffect, useRef, useState } from "react";
import { D, explorerAddress } from "@/lib/config";
import { errorText } from "@/lib/errors";
import { fmtUsdc, shortAddr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useBalance } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { AppError } from "@/lib/errors";
import { useConfirm } from "./confirm";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { Button, cx, inputCls, Spinner } from "./ui";

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
  const ask = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasQuick = w.accounts.some((a) => a.kind === "quick");
  const atRisk = !!w.active && w.active.kind === "quick" && !w.backedUp(w.active.address) && !!balance && balance > 0n;

  function backup() {
    download(`coc-wallets-${new Date().toISOString().slice(0, 10)}.json`, w.exportBackup());
    toast({ tone: "good", text: t.wallet.backedUp });
  }

  function restore(text: string) {
    try {
      const n = w.importBackup(text, t.wallet.restoredName);
      toast({ tone: n ? "good" : "info", text: n ? t.wallet.restored(n) : t.wallet.restoredNone });
      setRestoreText("");
      setShowRestore(false);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    }
  }

  async function removeAccount(id: string, address: string, kind: string) {
    const risky = kind === "quick" && !w.backedUp(address as `0x${string}`);
    const ok = await ask({
      title: t.wallet.removeTitle,
      body: risky ? t.wallet.removeRisky : t.wallet.removeBody,
      confirm: t.wallet.remove,
      danger: true,
    });
    if (ok) w.remove(id);
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!w.ready) return <Spinner className="text-zinc-500" />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 border border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold text-zinc-50 transition-colors hover:border-zinc-400 hover:bg-white/5"
        aria-expanded={open}
      >
        {w.active ? (
          <>
            <span className={cx("h-2 w-2", atRisk ? "animate-pulse bg-amber-400" : "bg-emerald-400")} />
            <span className="max-w-[9rem] truncate whitespace-nowrap">{w.active.label}</span>
            <span className="hidden whitespace-nowrap font-mono text-xs text-zinc-400 sm:inline">{balance !== undefined ? fmtUsdc(balance, loc) : ""}</span>
          </>
        ) : (
          t.wallet.create
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-2rem))] animate-slide-down overflow-y-auto rounded-none border border-zinc-800 bg-surface p-4 shadow-float">
          {atRisk && (
            <div className="mb-3 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{t.wallet.atRisk}</p>
                <button onClick={backup} className="mt-1 font-semibold underline">
                  {t.wallet.backupNow}
                </button>
              </div>
            </div>
          )}
          {w.active && (
            <div className="mb-4 rounded-none bg-zinc-900 p-3">
              <p className="text-xs text-zinc-400">{t.wallet.active}</p>
              <p className="font-semibold">{w.active.label}</p>
              <button
                className="mt-0.5 font-mono text-xs text-zinc-400 hover:underline"
                onClick={() => {
                  navigator.clipboard?.writeText(w.active!.address);
                  toast({ tone: "info", text: t.wallet.copied });
                }}
              >
                {shortAddr(w.active.address)} · {t.wallet.copy}
              </button>
              {explorerAddress(w.active.address) && (
                <a className="ml-2 text-xs text-zinc-400 underline" href={explorerAddress(w.active.address)} target="_blank" rel="noreferrer">
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

          {w.accounts.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{w.accounts.length > 1 ? t.wallet.switch : t.wallet.yours}</p>
              <ul className="space-y-1">
                {w.accounts.map((a) => (
                  <li key={a.id} className="group flex items-center gap-1">
                    {editing === a.id ? (
                      <form
                        className="flex flex-1 gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = (new FormData(e.currentTarget).get("label") as string).trim();
                          if (v) w.rename(a.id, v);
                          setEditing(null);
                        }}
                      >
                        <input name="label" autoFocus defaultValue={a.label} className={cx(inputCls, "py-1.5 text-sm")} />
                        <Button type="submit" className="min-h-9 shrink-0 px-3 py-1.5">
                          <Icon name="check" className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          w.select(a.id);
                          setOpen(false);
                        }}
                        className={cx(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-900",
                          a.id === w.active?.id && "bg-brand-500/10 font-semibold text-brand-200",
                        )}
                      >
                        <span className="truncate">{a.label}</span>
                        <span className="shrink-0 font-mono text-xs text-zinc-400">{shortAddr(a.address)}</span>
                      </button>
                    )}
                    {editing !== a.id && (
                      <>
                        <button onClick={() => setEditing(a.id)} className="p-1.5 text-zinc-500 transition-colors hover:text-white" title={t.wallet.rename} aria-label={t.wallet.rename}>
                          <Icon name="edit" className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeAccount(a.id, a.address, a.kind)} className="p-1.5 text-zinc-500 transition-colors hover:text-brand-400" title={t.wallet.remove} aria-label={t.wallet.remove}>
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.wallet.add}</p>
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
          <p className="mt-1.5 text-xs text-zinc-400">{t.wallet.quickHint}</p>
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

          <div className="mt-4 border-t border-zinc-800 pt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.wallet.backupTitle}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="min-h-10 px-2 text-xs" disabled={!hasQuick} onClick={backup}>
                <Icon name="download" className="h-4 w-4" />
                {t.wallet.backup}
              </Button>
              <Button variant="secondary" className="min-h-10 px-2 text-xs" onClick={() => setShowRestore((v) => !v)}>
                <Icon name="upload" className="h-4 w-4" />
                {t.wallet.restore}
              </Button>
            </div>
            {showRestore && (
              <div className="mt-2 animate-fade-up space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) restore(await f.text());
                    e.target.value = "";
                  }}
                />
                <Button variant="ghost" className="w-full border border-dashed border-zinc-700 text-xs" onClick={() => fileRef.current?.click()}>
                  {t.wallet.chooseFile}
                </Button>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (restoreText.trim()) restore(restoreText);
                  }}
                >
                  <input
                    className={cx(inputCls, "font-mono text-xs")}
                    type="password"
                    autoComplete="off"
                    placeholder={t.wallet.pastePk}
                    value={restoreText}
                    onChange={(e) => setRestoreText(e.target.value)}
                  />
                  <Button type="submit" className="shrink-0 px-3" disabled={!restoreText.trim()}>
                    <Icon name="key" className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            )}
            <p className="mt-1.5 text-xs text-zinc-500">{t.wallet.backupHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
