"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { todos } from "@/lib/inbox";
import { useMyLeases } from "@/lib/useInbox";
import { Icon, LogoMark } from "./icons";
import { cx } from "./ui";
import { WalletMenu } from "./WalletMenu";

/** How many leases wait on the active wallet. Shown as a red dot on "My leases". */
function useTodoCount() {
  const { me, data } = useMyLeases(20000);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(t);
  }, []);
  return todos(data, me, now).length + (data && data.credit > 0n ? 1 : 0);
}

function Dot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-brand-500 px-1 font-mono text-[10px] font-bold leading-none text-white">
      {n}
    </span>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const todo = useTodoCount();
  useEffect(() => setOpen(false), [path]);

  const links = [
    { href: "/rooms", label: t.nav.rooms, cls: "hidden md:block" },
    { href: "/create", label: t.nav.create, cls: "hidden lg:block" },
    { href: "/stats", label: t.nav.stats, cls: "hidden xl:block" },
    { href: "/transparency", label: t.nav.transparency, cls: "hidden 2xl:block" },
  ];
  const navCls = (href: string) =>
    cx(
      "relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
      path === href
        ? "text-white after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-brand-500"
        : "text-zinc-400 hover:text-white",
    );

  return (
    <header data-chrome className="sticky top-0 z-30 border-b border-zinc-800 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <LogoMark className="h-8 w-8 transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-105" />
          <span className="text-xl font-extrabold tracking-tight text-white">
            cọc<sup className="ml-0.5 font-mono text-[10px] font-bold text-brand-500">AVAX</sup>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={cx(navCls(l.href), l.cls)}>
              {l.label}
            </Link>
          ))}
          <Link href="/me" className={cx(navCls("/me"), "hidden sm:block")}>
            <span className="relative pr-4.5">
              {t.nav.mine}
              <Dot n={todo} />
            </span>
          </Link>
          <Link
            href="/demo"
            className={cx(
              "hidden whitespace-nowrap border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors md:block",
              path === "/demo" ? "border-brand-500 bg-brand-500 text-white" : "border-brand-500/60 text-brand-400 hover:bg-brand-500 hover:text-white",
            )}
          >
            {t.nav.demo}
          </Link>
          <div className="hidden border border-zinc-700 font-mono text-xs font-bold sm:flex" role="group" aria-label={t.langToggleTitle}>
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
          <button
            className="relative grid h-10 w-10 place-items-center border border-zinc-700 text-zinc-200 transition-colors hover:border-zinc-500 xl:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={t.nav.menu}
          >
            <Icon name={open ? "x" : "menu"} className="h-5 w-5" />
            <Dot n={open ? 0 : todo} />
          </button>
        </nav>
      </div>

      {open && (
        <div className="animate-slide-down border-t border-zinc-800 bg-canvas/95 backdrop-blur-md xl:hidden">
          <div className="stagger mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:grid-cols-2">
            {[
              { href: "/me", label: t.nav.mine, icon: "inbox" as const, n: todo },
              { href: "/rooms", label: t.nav.rooms, icon: "home" as const },
              { href: "/create", label: t.nav.create, icon: "fileText" as const },
              { href: "/demo", label: t.nav.demo, icon: "play" as const },
              { href: "/stats", label: t.nav.stats, icon: "zap" as const },
              { href: "/transparency", label: t.nav.transparency, icon: "shield" as const },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cx(
                  "flex items-center gap-3 border px-3 py-3 text-sm font-semibold transition-colors",
                  path === l.href ? "border-brand-500 bg-brand-500/10 text-white" : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white",
                )}
              >
                <Icon name={l.icon} className="h-4 w-4 text-brand-400" />
                <span className="flex-1">{l.label}</span>
                {!!l.n && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 font-mono text-[11px] font-bold text-white">{l.n}</span>}
              </Link>
            ))}
            <div className="flex items-center justify-between border border-zinc-800 px-3 py-2 sm:col-span-2">
              <span className="text-sm text-zinc-400">{t.nav.language}</span>
              <div className="flex border border-zinc-700 font-mono text-xs font-bold">
                {(["en", "vi"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    aria-pressed={lang === l}
                    className={cx("min-h-9 px-3 transition-colors", lang === l ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white")}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
