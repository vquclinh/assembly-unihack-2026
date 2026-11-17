"use client";

import { Icon } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p className="animate-float font-mono text-7xl font-extrabold text-brand-500">404</p>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t.pages.notFoundTitle}</h1>
      <p className="mt-2 text-zinc-400">{t.pages.notFoundBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/">
          <Icon name="home" className="h-4 w-4" />
          {t.pages.home}
        </ButtonLink>
        <ButtonLink href="/rooms" variant="secondary">
          {t.nav.rooms}
        </ButtonLink>
      </div>
    </div>
  );
}
