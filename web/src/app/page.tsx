"use client";

import { Icon, type IconName } from "@/components/icons";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { useT } from "@/lib/i18n";

const STEP_ICONS: IconName[] = ["link", "lock", "camera", "logOut"];
const GUARANTEE_ICONS: IconName[] = ["shield", "clock", "scale", "zap", "userCheck", "sparkles"];

export default function Home() {
  const t = useT();
  const h = t.home;
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="relative -mx-4 -mt-6 overflow-hidden border-b border-zinc-800 px-4 pb-16 pt-12 sm:pt-20">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 bg-brand-500/20 blur-[120px]" />

        <div className="relative grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Eyebrow className="mb-5">{h.eyebrow}</Eyebrow>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">{h.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">{h.lead}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/create" className="px-6 text-base">
                {h.ctaCreate}
                <Icon name="arrowRight" className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/me" variant="secondary" className="px-6 text-base">
                {h.ctaMine}
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
              {h.trust.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Icon name="check" className="h-3.5 w-3.5 text-brand-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <DemoCard />
        </div>
      </section>

      {/* Problem with numbers */}
      <section>
        <Eyebrow className="mb-3">{h.statsTitle}</Eyebrow>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{h.problemTitle}</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-zinc-400">{h.problemBody}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {h.stats.map(([value, label]) => (
            <div key={label} className="border border-zinc-800 border-t-2 border-t-brand-500 bg-surface p-5">
              <p className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{value}</p>
              <p className="mt-3 font-mono text-[11px] uppercase leading-relaxed tracking-wider text-zinc-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">{h.statsSource}</p>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">{h.howTitle}</h2>
        <ol className="grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
          {h.steps.map(([title, desc], i) => (
            <li key={title} className="group relative bg-surface p-6 transition-colors hover:bg-surface-2">
              <div className="mb-6 flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-brand-500">{String(i + 1).padStart(2, "0")}</span>
                <Icon name={STEP_ICONS[i]} className="h-5 w-5 text-zinc-500 transition-colors group-hover:text-brand-500" />
              </div>
              <h3 className="font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Guarantees */}
      <section>
        <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">{h.guaranteesTitle}</h2>
        <div className="grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
          {h.guarantees.map(([title, desc], i) => (
            <div key={title} className="bg-canvas p-6">
              <span className="grid h-10 w-10 place-items-center border border-brand-500/40 bg-brand-500/10 text-brand-500">
                <Icon name={GUARANTEE_ICONS[i]} className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Scope */}
      <section className="flex gap-4 border border-zinc-800 border-l-2 border-l-brand-500 bg-surface p-6 text-sm text-zinc-400">
        <Icon name="xCircle" className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
        <div>
          <h2 className="mb-2 text-base font-bold text-white">{h.notTitle}</h2>
          <p className="leading-relaxed">{h.notBody}</p>
        </div>
      </section>
    </div>
  );
}

/** Static illustration of a live deposit, shown in the hero. */
function DemoCard() {
  const t = useT();
  const d = t.home.demo;
  const current = 2;
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="border border-zinc-700 bg-surface shadow-[8px_8px_0_0_var(--color-brand-500)]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-400">{d.id}</span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse bg-emerald-400" />
            {t.status[3]}
          </span>
        </div>

        <div className="px-5 pt-5">
          <p className="text-sm text-zinc-400">{d.room}</p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-zinc-500">{d.locked}</p>
          <p className="mt-1 flex items-center gap-3 text-4xl font-extrabold tracking-tight text-white">
            {d.amount}
            <Icon name="lock" className="h-6 w-6 text-brand-500" />
          </p>
        </div>

        <ol className="mt-6 grid grid-cols-5 gap-1 px-5">
          {t.steps.map((s, i) => (
            <li key={s}>
              <span className={`block h-1 ${i < current ? "bg-brand-500" : i === current ? "bg-brand-400 animate-pulse" : "bg-zinc-800"}`} />
              <span className={`mt-2 block truncate font-mono text-[10px] uppercase tracking-wide ${i <= current ? "text-zinc-200" : "text-zinc-600"}`}>{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid grid-cols-2 border-t border-zinc-800">
          <div className="border-r border-zinc-800 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{d.landlord}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">{d.landlordNote}</p>
          </div>
          <div className="p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{d.tenant}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">{d.tenantNote}</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 flex items-center gap-2 border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-900 sm:-left-8">
        <Icon name="shield" className="h-4 w-4 text-brand-500" />
        {d.proof}
      </div>
    </div>
  );
}
