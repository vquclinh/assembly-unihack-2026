"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { formatEther } from "viem";
import { explorerTx } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { lookupTx } from "@/lib/tx";
import { Icon } from "./icons";
import { cx } from "./ui";

type Toast = { id: number; tone: "good" | "bad" | "info"; text: string; tx?: string; leaving?: boolean; life: number };
const Ctx = createContext<(t: Omit<Toast, "id" | "life">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [list, setList] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setList((l) => l.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 260);
  }, []);
  const push = useCallback(
    (item: Omit<Toast, "id" | "life">) => {
      const id = Date.now() + Math.random();
      const life = item.tone === "bad" ? 9000 : item.tx ? 8000 : 5000;
      setList((l) => [...l.slice(-3), { ...item, id, life }]);
      setTimeout(() => dismiss(id), life);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div data-toast className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {list.map((item) => {
          const info = lookupTx(item.tx);
          return (
            <div
              key={item.id}
              role="status"
              className={cx(
                "pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden border-l-4 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 shadow-float",
                item.leaving ? "animate-toast-out" : "animate-toast-in",
                item.tone === "good" && "border-emerald-500",
                item.tone === "bad" && "border-brand-500",
                item.tone === "info" && "border-zinc-900",
              )}
            >
              <span
                className={cx(
                  "mt-0.5 grid h-5 w-5 shrink-0 animate-pop place-items-center rounded-full text-white",
                  item.tone === "good" ? "bg-emerald-500" : item.tone === "bad" ? "bg-brand-500" : "bg-zinc-900",
                )}
              >
                <Icon name={item.tone === "good" ? "check" : item.tone === "bad" ? "alert" : "info"} className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p>{item.text}</p>
                {info && (
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-700">
                    <Icon name="bolt" className="h-3 w-3" />
                    {t.common.finality(info.ms < 100 ? "<0.1" : (info.ms / 1000).toFixed(1), Number(formatEther(info.fee)).toFixed(5))}
                  </p>
                )}
                {item.tx && explorerTx(item.tx) && (
                  <a className="mt-1 inline-block text-xs underline opacity-90" href={explorerTx(item.tx)} target="_blank" rel="noreferrer">
                    {t.common.viewTx}
                  </a>
                )}
              </div>
              <button onClick={() => dismiss(item.id)} className="-mr-1 -mt-0.5 p-1 text-zinc-400 transition-colors hover:text-zinc-900" aria-label="Close">
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
              <span
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-drain bg-zinc-900/15"
                style={{ animationDuration: `${item.life}ms` }}
              />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
