"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { explorerTx } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { cx } from "./ui";

type Toast = { id: number; tone: "good" | "bad" | "info"; text: string; tx?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.tone === "bad" ? 9000 : 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div data-toast className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {list.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cx(
              "pointer-events-auto w-full max-w-md border-l-4 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 shadow-float",
              item.tone === "good" && "border-emerald-500",
              item.tone === "bad" && "border-brand-500",
              item.tone === "info" && "border-zinc-900",
            )}
          >
            <p>{item.text}</p>
            {item.tx && explorerTx(item.tx) && (
              <a className="mt-1 inline-block text-xs underline opacity-90" href={explorerTx(item.tx)} target="_blank" rel="noreferrer">
                {t.common.viewTx}
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
