"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LogoMark } from "./icons";
import { cx } from "./ui";
import { WalletMenu } from "./WalletMenu";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const navCls = (href: string) =>
    cx(
      "relative px-3 py-2 text-sm font-medium transition-colors",
      path === href
        ? "text-white after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-brand-500"
        : "text-zinc-400 hover:text-white",
    );
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-xl font-extrabold tracking-tight text-white">
            cọc<sup className="ml-0.5 font-mono text-[10px] font-bold text-brand-500">AVAX</sup>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/create" className={cx(navCls("/create"), "hidden md:block")}>
            {t.nav.create}
          </Link>
          <Link href="/me" className={navCls("/me")}>
            {t.nav.mine}
          </Link>
          <div className="flex border border-zinc-700 font-mono text-xs font-bold" role="group" aria-label={t.langToggleTitle}>
            {(["en", "vi"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cx("min-h-9 px-2.5 transition-colors", lang === l ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white")}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <WalletMenu />
        </nav>
      </div>
    </header>
  );
}
