"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "border border-brand-500 bg-brand-500 text-white hover:border-brand-600 hover:bg-brand-600 disabled:opacity-40",
  secondary: "border border-zinc-600 bg-transparent text-zinc-50 hover:border-zinc-400 hover:bg-white/5 disabled:opacity-40",
  danger: "border border-rose-500/50 bg-transparent text-rose-300 hover:bg-rose-500/10 disabled:opacity-40",
  ghost: "text-zinc-300 hover:bg-white/5 hover:text-white disabled:opacity-40",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold tracking-tight transition-colors disabled:cursor-not-allowed",
        VARIANT[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx("inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold tracking-tight transition-colors", VARIANT[variant], className)}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("border border-zinc-800 bg-surface p-5", className)}>{children}</section>;
}

const TONE = {
  neutral: "bg-zinc-800/60 text-zinc-300 ring-1 ring-inset ring-zinc-700",
  info: "bg-brand-500/10 text-brand-400 ring-1 ring-inset ring-brand-500/30",
  good: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  bad: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-semibold", TONE[tone], className)}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-100">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-none border border-zinc-700 bg-canvas px-3.5 py-2.5 text-[15px] text-zinc-50 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-50">{children}</span>
    </div>
  );
}

/** Small monospace label in Avalanche red, used above headings. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("font-mono text-xs font-bold uppercase tracking-[0.25em] text-brand-500", className)}>{children}</p>;
}
