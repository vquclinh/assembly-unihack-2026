"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { WalletMenu } from "./WalletMenu";

export function Header() {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-lg font-extrabold text-white">C</span>
          <span className="text-lg font-extrabold tracking-tight">Cọc</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/create" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 md:block">
            {t.nav.create}
          </Link>
          <Link href="/me" className="rounded-lg px-2.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 sm:px-3">
            {t.nav.mine}
          </Link>
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            title={t.langToggleTitle}
            className="min-h-11 rounded-lg px-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100"
          >
            {t.langToggle}
          </button>
          <WalletMenu />
        </nav>
      </div>
    </header>
  );
}
