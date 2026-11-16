"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Address, type Hex, getAddress, isAddress, parseEventLogs, zeroAddress } from "viem";
import { useToast } from "@/components/toast";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { publicClient, chainNow } from "@/lib/client";
import { escrowAbi, isDeployed } from "@/lib/config";
import { uploadJson, uploadPhoto } from "@/lib/files";
import { errorText } from "@/lib/errors";
import { fmtUsdc, parseVnd, shortAddr, vndToUsdc } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Terms } from "@/lib/lease";
import { relayEscrowCall } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

/** Preset durations in seconds; labels come from the dictionary in the same order. */
const MOVE_IN = [10 * 60, 86400, 3 * 86400, 7 * 86400];
const LENGTH = [30 * 60, 182 * 86400, 365 * 86400];

/** Optional list of suggested mediators, e.g. "Student Affairs Office|0xabc...,..." */
const SUGGESTED: { name: string; address: string }[] = (process.env.NEXT_PUBLIC_MEDIATORS || "")
  .split(",")
  .map((x) => x.split("|"))
  .filter((p) => p.length === 2 && isAddress(p[1].trim()))
  .map(([name, address]) => ({ name: name.trim(), address: address.trim() }));

function vndInput(v: string, locale: string) {
  const n = parseVnd(v);
  return n ? n.toLocaleString(locale) : "";
}

export default function CreatePage() {
  const w = useWallet();
  const toast = useToast();
  const router = useRouter();
  const t = useT();
  const c = t.create;
  const loc = t.locale;
  const [title, setTitle] = useState("");
  const [addr, setAddr] = useState("");
  const [rent, setRent] = useState("3000000");
  const [deposit, setDeposit] = useState("3000000");
  const [hold, setHold] = useState("500000");
  const [notes, setNotes] = useState("");
  const [moveIn, setMoveIn] = useState(MOVE_IN[0]);
  const [length, setLength] = useState(LENGTH[0]);
  const [mediator, setMediator] = useState("");
  const [lockTenant, setLockTenant] = useState("");
  const [yieldOptIn, setYieldOptIn] = useState(true);
  const [listed, setListed] = useState(true);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const depositUsdc = vndToUsdc(parseVnd(deposit));
  const holdUsdc = vndToUsdc(parseVnd(hold));

  const mediatorChoices = useMemo(() => {
    const mine = w.accounts.filter((a) => a.id !== w.active?.id).map((a) => ({ name: `${a.label} ${c.yourWallet}`, address: a.address }));
    return [...SUGGESTED, ...mine];
  }, [w.accounts, w.active, c.yourWallet]);

  const problems: string[] = [];
  if (!title.trim()) problems.push(c.problems.title);
  if (holdUsdc <= 0n) problems.push(c.problems.hold);
  if (depositUsdc < holdUsdc) problems.push(c.problems.total);
  if (!isAddress(mediator.trim())) problems.push(c.problems.mediator);
  else if (w.active && getAddress(mediator.trim()) === w.active.address) problems.push(c.problems.mediatorSelf);
  if (lockTenant.trim() && !isAddress(lockTenant.trim())) problems.push(c.problems.tenant);
  if (length <= moveIn) problems.push(c.problems.length);

  async function submit() {
    if (!w.active) return toast({ tone: "bad", text: t.act.needWallet });
    if (problems.length) return toast({ tone: "bad", text: problems[0] });
    setBusy(true);
    try {
      const photoHashes: Hex[] = [];
      for (const f of photos) photoHashes.push(await uploadPhoto(f));
      const terms: Terms = {
        kind: "terms",
        v: 1,
        title: title.trim(),
        address: addr.trim(),
        rentVnd: parseVnd(rent),
        depositVnd: parseVnd(deposit),
        holdVnd: parseVnd(hold),
        notes: notes.trim(),
        listed: listed && !lockTenant.trim(),
        photos: photoHashes,
        createdAt: new Date().toISOString(),
      };
      const termsHash = await uploadJson(terms);
      const now = await chainNow();
      const hash = await relayEscrowCall({ address: w.active.address, signTypedData: w.signTypedData }, "createOffer", [
        (lockTenant.trim() || zeroAddress) as Address,
        getAddress(mediator.trim()),
        holdUsdc,
        depositUsdc,
        BigInt(now + moveIn),
        BigInt(now + length),
        yieldOptIn,
        termsHash,
      ]);
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "OfferCreated", logs: receipt.logs });
      const id = (ev as unknown as { args: { id: bigint } }).args.id;
      toast({ tone: "good", text: c.created, tx: hash });
      router.push(`/l/${id}`);
    } catch (e) {
      toast({ tone: "bad", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{c.title}</h1>
        <p className="mt-1 text-zinc-400">{c.lead}</p>
      </div>

      <Card className="space-y-4">
        <h2 className="font-bold">{c.room}</h2>
        <Field label={c.roomName}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.roomNamePlaceholder} />
        </Field>
        <Field label={c.address} hint={c.addressHint}>
          <input className={inputCls} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={c.addressPlaceholder} />
        </Field>
        <Field label={c.rent} hint={c.rentHint}>
          <input className={inputCls} inputMode="numeric" value={vndInput(rent, loc)} onChange={(e) => setRent(String(parseVnd(e.target.value)))} />
        </Field>
        <Field label={c.notes} hint={c.notesHint}>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label={c.photos} hint={c.photosHint}>
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((f, i) => (
              <button
                key={`${f.name}-${i}`}
                type="button"
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                className="relative h-16 w-16 overflow-hidden border border-zinc-700"
                title="×"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <span className="absolute right-0 top-0 bg-black/70 px-1 text-xs text-white">×</span>
              </button>
            ))}
            {photos.length < 6 && (
              <span className="inline-flex h-16 cursor-pointer items-center border border-dashed border-zinc-600 px-3 text-xs text-zinc-300 hover:border-zinc-400">
                {c.addPhotos}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, 6))}
                />
              </span>
            )}
          </div>
        </Field>
        <label className="flex items-start gap-3 bg-zinc-900 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={listed} onChange={(e) => setListed(e.target.checked)} />
          <span>
            <b>{c.listed}</b> <span className="text-zinc-400">{c.listedBody}</span>
          </span>
        </label>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">{c.deposit}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={c.hold} hint={c.holdHint(fmtUsdc(holdUsdc, loc))}>
            <input className={inputCls} inputMode="numeric" value={vndInput(hold, loc)} onChange={(e) => setHold(String(parseVnd(e.target.value)))} />
          </Field>
          <Field label={c.total} hint={c.totalHint(fmtUsdc(depositUsdc, loc))}>
            <input className={inputCls} inputMode="numeric" value={vndInput(deposit, loc)} onChange={(e) => setDeposit(String(parseVnd(e.target.value)))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={c.moveIn}>
            <select className={inputCls} value={moveIn} onChange={(e) => setMoveIn(Number(e.target.value))}>
              {MOVE_IN.map((sec, i) => (
                <option key={sec} value={sec}>
                  {c.moveInPresets[i]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={c.length}>
            <select className={inputCls} value={length} onChange={(e) => setLength(Number(e.target.value))}>
              {LENGTH.map((sec, i) => (
                <option key={sec} value={sec}>
                  {c.lengthPresets[i]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-none bg-zinc-900 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={yieldOptIn} onChange={(e) => setYieldOptIn(e.target.checked)} />
          <span>
            <b>{c.yieldTitle}</b> {c.yieldBody}
          </span>
        </label>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">{c.mediator}</h2>
        <p className="text-sm text-zinc-400">{c.mediatorBody}</p>
        {mediatorChoices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mediatorChoices.map((m) => (
              <button
                key={m.address}
                type="button"
                onClick={() => setMediator(m.address)}
                className="border border-zinc-700 px-3 py-1.5 font-mono text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
              >
                {m.name} · {shortAddr(m.address)}
              </button>
            ))}
          </div>
        )}
        <Field label={c.mediatorAddress}>
          <input className={`${inputCls} font-mono text-sm`} value={mediator} onChange={(e) => setMediator(e.target.value)} placeholder="0x…" />
        </Field>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400">{c.lockSummary}</summary>
          <div className="mt-3">
            <Field label={c.lockAddress} hint={c.lockHint}>
              <input className={`${inputCls} font-mono text-sm`} value={lockTenant} onChange={(e) => setLockTenant(e.target.value)} placeholder="0x…" />
            </Field>
          </div>
        </details>
      </Card>

      <div className="sticky bottom-4 rounded-none border border-zinc-800 bg-surface/95 p-4 shadow-lg backdrop-blur">
        {problems.length > 0 && <p className="mb-2 text-sm text-zinc-400">{problems[0]}</p>}
        <Button className="w-full text-base" loading={busy} disabled={!isDeployed || !w.active} onClick={submit}>
          {w.active ? c.submit : c.needWallet}
        </Button>
      </div>
    </div>
  );
}
