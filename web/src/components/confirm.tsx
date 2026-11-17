"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Icon } from "./icons";
import { Button, cx } from "./ui";

type Ask = { title: string; body?: ReactNode; confirm?: string; cancel?: string; danger?: boolean };
type Open = Ask & { resolve: (ok: boolean) => void; leaving?: boolean };
const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false);

/** A styled replacement for window.confirm, so every risky step asks the same way. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState<Open | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback((a: Ask) => new Promise<boolean>((resolve) => setOpen({ ...a, resolve })), []);
  const close = useCallback(
    (ok: boolean) => {
      if (!open) return;
      open.resolve(ok);
      setOpen({ ...open, leaving: true });
      setTimeout(() => setOpen(null), 200);
    },
    [open],
  );

  useEffect(() => {
    if (!open || open.leaving) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {open && (
        <div
          className={cx("fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm", open.leaving ? "animate-toast-out" : "animate-fade-in")}
          onClick={() => close(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            className={cx(
              "w-full max-w-sm border border-zinc-700 bg-surface p-5 shadow-[8px_8px_0_0_var(--color-brand-500)]",
              open.leaving ? "" : "animate-toast-in",
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cx("grid h-9 w-9 shrink-0 animate-pop place-items-center", open.danger ? "bg-brand-500/15 text-brand-400" : "bg-white/10 text-white")}>
                <Icon name={open.danger ? "alert" : "info"} className="h-5 w-5" />
              </span>
              <div>
                <h2 id="confirm-title" className="font-bold text-white">
                  {open.title}
                </h2>
                {open.body && <div className="mt-1 text-sm text-zinc-400">{open.body}</div>}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => close(false)}>
                {open.cancel ?? t.common.cancel}
              </Button>
              <Button ref={okRef} variant={open.danger ? "primary" : "primary"} onClick={() => close(true)}>
                {open.confirm ?? t.common.ok}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
