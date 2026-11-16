"use client";

import { ButtonLink } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function Home() {
  const h = useT().home;
  return (
    <div className="space-y-16">
      <section className="pt-6 sm:pt-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-700">{h.eyebrow}</p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">{h.title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-stone-600">{h.lead}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/create" className="px-6 text-base">
            {h.ctaCreate}
          </ButtonLink>
          <ButtonLink href="/me" variant="secondary" className="px-6 text-base">
            {h.ctaMine}
          </ButtonLink>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">{h.problemTitle}</h2>
        <p className="mt-2 max-w-2xl text-stone-600">{h.problemBody}</p>
      </section>

      <section>
        <h2 className="mb-5 text-2xl font-bold">{h.howTitle}</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {h.steps.map(([title, desc], i) => (
            <li key={title} className="rounded-2xl border border-stone-200 bg-white p-5">
              <span className="text-sm font-bold text-emerald-700">{h.step(i + 1)}</span>
              <h3 className="mt-1 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-stone-600">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-5 text-2xl font-bold">{h.guaranteesTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {h.guarantees.map(([title, desc]) => (
            <div key={title} className="rounded-2xl bg-emerald-900 p-5 text-emerald-50">
              <h3 className="font-bold text-white">{title}</h3>
              <p className="mt-1.5 text-sm text-emerald-100/90">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
        <h2 className="mb-2 text-base font-bold text-stone-900">{h.notTitle}</h2>
        <p>{h.notBody}</p>
      </section>
    </div>
  );
}
