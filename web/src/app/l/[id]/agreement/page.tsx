"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { zeroAddress, zeroHash } from "viem";
import { useDoc } from "@/components/docs";
import { Icon, LogoMark } from "@/components/icons";
import { Button, Spinner } from "@/components/ui";
import { AGREEMENT, type AgreementVars, duration, vnDate } from "@/lib/agreement";
import { D, ESCROW, chain, isDeployed } from "@/lib/config";
import { fmtUsdc, fmtVnd } from "@/lib/format";
import { useLease } from "@/lib/hooks";
import { DICTS, useT } from "@/lib/i18n";
import type { Terms } from "@/lib/lease";

const LANGS = ["en", "vi"] as const;

/**
 * Printable, bilingual deposit agreement built only from on-chain data and the
 * fingerprinted terms file. "Print" in the browser saves it as a PDF.
 */
export default function AgreementPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data: snap } = useLease(id);
  const terms = useDoc<Terms>(snap?.lease.termsHash);
  const t = useT();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/l/${params.id}`), [params.id]);

  if (!isDeployed) return <p className="text-zinc-400">{t.lease.notConfigured}</p>;
  if (id === null) return <p className="text-zinc-400">{t.lease.invalidId}</p>;
  if (!snap || terms.loading) return <Spinner className="text-zinc-500" />;
  const L = snap.lease;
  if (L.status === 0) return <p className="text-zinc-400">{t.lease.notFound(id.toString())}</p>;
  const doc = terms.doc;

  const vars = (lang: "en" | "vi"): AgreementVars => {
    const locale = lang === "en" ? "en-US" : "vi-VN";
    return {
      hold: `${fmtVnd(L.holdAmount, locale)} (${fmtUsdc(L.holdAmount, locale)})`,
      deposit: `${fmtVnd(L.depositAmount, locale)} (${fmtUsdc(L.depositAmount, locale)})`,
      moveIn: vnDate(L.moveInDeadline, lang),
      leaseEnd: vnDate(L.leaseEnd, lang),
      response: duration(L.responseWindow, lang),
      mediation: duration(L.mediationTimeout, lang),
      yieldMode: L.yieldOn ? "on" : L.landlordYieldOptIn ? "offered" : "off",
    };
  };

  const Row = ({ label, value, mono }: { label: [string, string]; value: string; mono?: boolean }) => (
    <tr className="border-t border-zinc-300 align-top">
      <th className="w-[38%] py-2 pr-3 print:py-1 text-left font-normal text-zinc-600">
        {label[0]}
        <span className="block text-[11px] italic text-zinc-500">{label[1]}</span>
      </th>
      <td className={mono ? "break-all py-2 font-mono text-[12px] print:py-1 print:text-[10px]" : "py-2 font-semibold print:py-1"}>{value}</td>
    </tr>
  );
  const both = (k: keyof (typeof AGREEMENT)["en"]) => [AGREEMENT.en[k], AGREEMENT.vi[k]] as [string, string];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/l/${params.id}`} className="text-sm font-semibold text-zinc-400 hover:text-white">
          ← {t.tools.backToLease}
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-zinc-500 sm:block">{t.tools.printHint}</p>
          <Button onClick={() => window.print()}>
            <Icon name="printer" className="h-4 w-4" />
            {t.tools.print}
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-6 text-[13px] leading-relaxed text-zinc-900 shadow-[8px_8px_0_0_var(--color-brand-500)] sm:p-10 print:max-w-none print:p-0 print:text-[12px] print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b-4 border-[#e84142] pb-4">
          <div className="flex items-start gap-3">
            <LogoMark className="h-11 w-11 shrink-0" />
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight">{AGREEMENT.en.title}</h1>
              <p className="text-base font-bold leading-tight text-zinc-700">{AGREEMENT.vi.title}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#e84142]">
                {AGREEMENT.en.subtitle} · {AGREEMENT.vi.subtitle}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">#{id.toString()}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {AGREEMENT.en.status} / {AGREEMENT.vi.status}
            </p>
            <p className="text-xs font-semibold">
              {DICTS.en.status[L.status]} / {DICTS.vi.status[L.status]}
            </p>
          </div>
        </header>

        {/* Room */}
        <section className="mt-5">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#e84142]">
            {AGREEMENT.en.room} / {AGREEMENT.vi.room}
          </h2>
          <p className="mt-1 text-lg font-bold">{doc?.title ?? t.lease.roomFallback}</p>
          {doc?.address && <p className="text-zinc-700">{doc.address}</p>}
          {doc && doc.rentVnd > 0 && (
            <p className="mt-1">
              <b>{doc.rentVnd.toLocaleString("vi-VN")} ₫</b>{" "}
              <span className="text-zinc-600">
                {AGREEMENT.en.perMonth} / {AGREEMENT.vi.perMonth}
              </span>
            </p>
          )}
        </section>

        {/* Parties, money, dates */}
        <section className="mt-5 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="mb-1 font-mono text-[11px] font-bold uppercase tracking-widest text-[#e84142]">
              {AGREEMENT.en.parties} / {AGREEMENT.vi.parties}
            </h2>
            <table className="w-full">
              <tbody>
                <Row label={both("landlord")} value={L.landlord} mono />
                <Row label={both("tenant")} value={L.tenant === zeroAddress ? `${AGREEMENT.en.open} / ${AGREEMENT.vi.open}` : L.tenant} mono={L.tenant !== zeroAddress} />
                <Row label={both("mediator")} value={L.mediator} mono />
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="mb-1 font-mono text-[11px] font-bold uppercase tracking-widest text-[#e84142]">
              {AGREEMENT.en.money} / {AGREEMENT.vi.money}
            </h2>
            <table className="w-full">
              <tbody>
                <Row label={both("hold")} value={vars("vi").hold} />
                <Row label={both("deposit")} value={vars("vi").deposit} />
                <Row label={both("moveIn")} value={vnDate(L.moveInDeadline, "vi")} />
                <Row label={both("leaseEnd")} value={vnDate(L.leaseEnd, "vi")} />
              </tbody>
            </table>
          </div>
        </section>

        {/* Rules, side by side */}
        <section className="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} lang={lang}>
              <h2 className="mb-2 border-b border-zinc-300 pb-1 font-bold">{AGREEMENT[lang].rulesTitle}</h2>
              <ol className="list-decimal space-y-1.5 pl-5 text-[12px] marker:font-mono marker:text-[#e84142]">
                {AGREEMENT[lang].rules(vars(lang)).map((r, i) => (
                  <li key={i} className="break-inside-avoid">
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        {doc?.notes && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-1 font-bold">
              {AGREEMENT.en.notes} / {AGREEMENT.vi.notes}
            </h2>
            <p className="whitespace-pre-wrap border-l-2 border-zinc-300 pl-3 text-zinc-800">{doc.notes}</p>
          </section>
        )}

        {/* Proof */}
        <section className="mt-6 grid break-inside-avoid gap-5 border-t-2 border-zinc-900 pt-4 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-bold">
              {AGREEMENT.en.proof} / {AGREEMENT.vi.proof}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-600">{AGREEMENT.en.proofBody}</p>
            <p className="mt-1 text-[11px] italic text-zinc-500">{AGREEMENT.vi.proofBody}</p>
            <table className="mt-2 w-full">
              <tbody>
                <Row label={both("termsHash")} value={L.termsHash} mono />
                <Row label={both("conditionHash")} value={L.conditionHash === zeroHash ? `${AGREEMENT.en.notYet} / ${AGREEMENT.vi.notYet}` : L.conditionHash} mono={L.conditionHash !== zeroHash} />
                <Row label={both("contract")} value={ESCROW} mono />
                <Row label={both("network")} value={`${chain.name} (chainId ${D.chainId})`} />
              </tbody>
            </table>
            {terms.verified === false && <p className="mt-2 text-xs font-bold text-[#e84142]">{t.docs.mismatch}</p>}
          </div>
          {url && (
            <div className="flex flex-col items-center gap-1 self-start">
              <QRCodeSVG value={url} size={116} />
              <p className="max-w-[120px] text-center text-[10px] text-zinc-500">
                {AGREEMENT.en.scan}
                <br />
                {AGREEMENT.vi.scan}
              </p>
            </div>
          )}
        </section>

        <footer className="mt-6 flex justify-between border-t border-zinc-300 pt-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          <span>coc · avalanche</span>
          <span>{url}</span>
        </footer>
      </article>
    </div>
  );
}
