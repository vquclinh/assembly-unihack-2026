"use client";

import { D, isDeployed } from "@/lib/config";
import { useT } from "@/lib/i18n";

export function NetworkBanner() {
  const t = useT();
  if (!isDeployed) return <div data-chrome className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-zinc-900">{t.banner.notDeployed}</div>;
  return (
    <div data-chrome className="flex items-center justify-center gap-2 border-b border-brand-500/40 bg-gradient-to-r from-brand-950 via-canvas to-brand-950 px-4 py-1.5 text-center font-mono text-[11px] tracking-wide text-zinc-300">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-brand-500" />
      <span>{t.banner.testnet(D.network === "fuji" ? t.banner.fuji : D.network)}</span>
    </div>
  );
}
