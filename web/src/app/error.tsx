"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid h-14 w-14 animate-pop place-items-center bg-brand-500/15 text-brand-400">
        <Icon name="alert" className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t.pages.errorTitle}</h1>
      <p className="mt-2 text-zinc-400">{t.pages.errorBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{t.pages.retry}</Button>
        <ButtonLink href="/" variant="secondary">
          {t.pages.home}
        </ButtonLink>
      </div>
      {error.digest && <p className="mt-6 font-mono text-[11px] text-zinc-600">ref {error.digest}</p>}
    </div>
  );
}
