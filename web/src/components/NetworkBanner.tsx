"use client";

import { D, isDeployed } from "@/lib/config";
import { useT } from "@/lib/i18n";

export function NetworkBanner() {
  const t = useT();
  if (!isDeployed) return <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">{t.banner.notDeployed}</div>;
  return (
    <div className="bg-stone-900 px-4 py-1.5 text-center text-xs text-stone-200">
      {t.banner.testnet(D.network === "fuji" ? t.banner.fuji : D.network)}
    </div>
  );
}
