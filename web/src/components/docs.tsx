"use client";

/* eslint-disable @next/next/no-img-element */
import { Icon } from "./icons";
import { useEffect, useState } from "react";
import { type Hex, zeroHash } from "viem";
import { fetchJson, fileUrl, uploadJson, uploadPhoto } from "@/lib/files";
import { errorText } from "@/lib/errors";
import { sampleFile } from "@/lib/samples";
import { useT } from "@/lib/i18n";
import { type ConditionReport, type Evidence, type ReportItem, type Ruling, type Terms } from "@/lib/lease";
import { Badge, Button, cx, inputCls } from "./ui";

export function useDoc<T>(hash?: Hex) {
  const [state, setState] = useState<{ doc?: T; verified?: boolean; missing?: boolean; loading: boolean }>({ loading: false });
  useEffect(() => {
    if (!hash || hash === zeroHash) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    setState({ loading: true });
    fetchJson<T>(hash)
      .then((r) => alive && setState(r ? { doc: r.doc, verified: r.verified, loading: false } : { missing: true, loading: false }))
      .catch(() => alive && setState({ missing: true, loading: false }));
    return () => {
      alive = false;
    };
  }, [hash]);
  return state;
}

export function VerifiedBadge({ verified, missing }: { verified?: boolean; missing?: boolean }) {
  const t = useT();
  if (missing) return <Badge tone="warn">{t.docs.missing}</Badge>;
  if (verified === undefined) return null;
  return verified ? <Badge tone="good">{t.docs.verified}</Badge> : <Badge tone="bad">{t.docs.mismatch}</Badge>;
}

export function PhotoGrid({ photos }: { photos: Hex[] }) {
  if (!photos.length) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        <a key={p} href={fileUrl(p)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-sm bg-zinc-900">
          <img src={fileUrl(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

export function TermsView({ hash }: { hash: Hex }) {
  const t = useT();
  const { doc, verified, missing, loading } = useDoc<Terms>(hash);
  if (loading) return <p className="text-sm text-zinc-400">{t.docs.loadingTerms}</p>;
  if (!doc) return <VerifiedBadge missing={missing} />;
  return (
    <div className="space-y-1 text-sm">
      {doc.address && <p className="text-zinc-400">{doc.address}</p>}
      {doc.photos && doc.photos.length > 0 && <PhotoGrid photos={doc.photos} />}
      {doc.rentVnd > 0 && (
        <p>
          <b>{t.terms.rent(`${doc.rentVnd.toLocaleString(t.locale)} ₫`)}</b> <span className="text-zinc-400">{t.terms.rentNote}</span>
        </p>
      )}
      {doc.notes && <p className="whitespace-pre-wrap text-zinc-300">{doc.notes}</p>}
      <VerifiedBadge verified={verified} />
    </div>
  );
}

export function useTermsTitle(hash?: Hex) {
  return useDoc<Terms>(hash).doc?.title;
}

export function ReportView({ hash, title }: { hash: Hex; title?: string }) {
  const t = useT();
  const { doc, verified, missing, loading } = useDoc<ConditionReport>(hash);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{title ?? t.docs.reportTitle}</h3>
        <VerifiedBadge verified={verified} missing={missing} />
      </div>
      {loading && <p className="text-sm text-zinc-400">{t.common.loading}</p>}
      {doc && (
        <ul className="space-y-4">
          {doc.items.map((it, i) => (
            <li key={i} className="border-t border-zinc-800 pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-semibold">{it.label}</p>
              {it.note && <p className="text-sm text-zinc-400">{it.note}</p>}
              <PhotoGrid photos={it.photos} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 break-all font-mono text-xs text-zinc-500">hash {hash}</p>
    </div>
  );
}

export function EvidenceView({ hash, title }: { hash: Hex; title: string }) {
  const t = useT();
  const { doc, verified, missing } = useDoc<Evidence>(hash);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        <VerifiedBadge verified={verified} missing={missing} />
      </div>
      {doc && (
        <>
          <p className="whitespace-pre-wrap text-sm text-zinc-300">{doc.text || t.docs.noDescription}</p>
          <PhotoGrid photos={doc.photos} />
        </>
      )}
    </div>
  );
}

export function RulingView({ hash }: { hash: Hex }) {
  const t = useT();
  const { doc, verified, missing } = useDoc<Ruling>(hash);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t.docs.rulingTitle}</h3>
        <VerifiedBadge verified={verified} missing={missing} />
      </div>
      {doc && <p className="whitespace-pre-wrap text-sm text-zinc-300">{doc.text}</p>}
    </div>
  );
}

function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const t = useT();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            title={t.docs.removePhoto}
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            className="relative aspect-square overflow-hidden rounded-sm bg-zinc-900"
          >
            <img src={u} alt="" className="h-full w-full object-cover" />
            <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white">×</span>
          </button>
        ))}
        <label className="grid aspect-square cursor-pointer place-items-center rounded-sm border-2 border-dashed border-zinc-700 text-center text-xs text-zinc-400 hover:bg-zinc-900">
          {t.docs.addPhoto}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onChange([...files, ...Array.from(e.target.files || [])]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

/** Loads one of the bundled sample photos (public/demo) as a File, for the judge demo. */
async function uploadAll(files: File[]) {
  const out: Hex[] = [];
  for (const f of files) out.push(await uploadPhoto(f));
  return out;
}

export function ReportBuilder({ leaseId, onSubmit, busy }: { leaseId: string; onSubmit: (hash: Hex) => Promise<void>; busy: boolean }) {
  const t = useT();
  const [items, setItems] = useState(() => t.docs.defaultItems.map((label) => ({ label, note: "", files: [] as File[] })));
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const total = items.reduce((n, it) => n + it.files.length, 0);

  async function submit() {
    setErr("");
    setUploading(true);
    try {
      const out: ReportItem[] = [];
      for (const it of items) {
        if (!it.note.trim() && !it.files.length) continue;
        out.push({ label: it.label, note: it.note.trim(), photos: await uploadAll(it.files) });
      }
      if (!out.length) throw new Error(t.docs.needOne);
      const doc: ConditionReport = { kind: "condition", v: 1, leaseId, items: out, createdAt: new Date().toISOString() };
      const hash = await uploadJson(doc);
      setUploading(false);
      await onSubmit(hash);
    } catch (e) {
      setErr(errorText(t, e));
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SampleButton
        onClick={async () => {
          const names = ["wall-clean.jpg", "floor.jpg", "bathroom.jpg"];
          const files = await Promise.all(names.map(sampleFile));
          setItems(items.map((x, i) => (i < names.length ? { ...x, note: t.docs.sampleNotes[i], files: [files[i]] } : x)));
        }}
      />
      {items.map((it, i) => (
        <div key={i} className="rounded-none border border-zinc-800 p-3">
          <input
            className="w-full bg-transparent text-sm font-semibold focus:outline-none"
            value={it.label}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <input
            className={cx(inputCls, "mt-2 text-sm")}
            placeholder={t.docs.itemPlaceholder}
            value={it.note}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
          />
          <PhotoPicker files={it.files} onChange={(files) => setItems(items.map((x, j) => (j === i ? { ...x, files } : x)))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm font-semibold text-brand-400 hover:text-brand-300"
          onClick={() => setItems([...items, { label: t.docs.otherItem, note: "", files: [] }])}
        >
          {t.docs.addItem}
        </button>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <Button data-demo="report" className="w-full" loading={uploading || busy} onClick={submit}>
        {uploading ? t.docs.uploading : t.docs.sendReport(total)}
      </Button>
    </div>
  );
}

export function EvidenceForm({
  leaseId,
  role,
  placeholder,
  submitLabel,
  onSubmit,
  busy,
  requireText = true,
}: {
  leaseId: string;
  role: "landlord" | "tenant";
  placeholder: string;
  submitLabel: string;
  onSubmit: (hash: Hex) => Promise<void>;
  busy: boolean;
  requireText?: boolean;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    setErr("");
    if (requireText && !text.trim()) return setErr(t.docs.writeSomething);
    setUploading(true);
    try {
      const doc: Evidence = { kind: "evidence", v: 1, leaseId, role, text: text.trim(), photos: await uploadAll(files), createdAt: new Date().toISOString() };
      const hash = await uploadJson(doc);
      setUploading(false);
      await onSubmit(hash);
    } catch (e) {
      setErr(errorText(t, e));
      setUploading(false);
    }
  }
  return (
    <div className="space-y-2">
      <SampleButton
        onClick={async () => {
          setFiles([await sampleFile(role === "landlord" ? "wall-stain.jpg" : "wall-clean.jpg")]);
          if (!text.trim()) setText(role === "landlord" ? t.docs.sampleLandlordText : t.docs.sampleTenantText);
        }}
      />
      <textarea className={inputCls} rows={3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <PhotoPicker files={files} onChange={setFiles} />
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <Button className="w-full" loading={uploading || busy} onClick={submit}>
        {submitLabel}
      </Button>
    </div>
  );
}

export async function makeRuling(leaseId: string, text: string, toTenant: bigint) {
  const doc: Ruling = { kind: "ruling", v: 1, leaseId, text, toTenant: toTenant.toString(), createdAt: new Date().toISOString() };
  return uploadJson(doc);
}

/** Fills a form with the bundled sample photos, so a demo never waits for a camera. */
function SampleButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 border border-dashed border-brand-500/60 bg-brand-500/5 px-3 py-2 text-sm font-semibold text-brand-400 transition-colors hover:bg-brand-500/15 hover:text-brand-300"
    >
      <Icon name="camera" className="h-4 w-4" />
      {t.docs.samplePhotos}
    </button>
  );
}

/**
 * Before/after slider: a move-in photo under a move-out photo, revealed by dragging. Makes a
 * "new stain" claim easy to check by eye, for both sides and the mediator.
 */
export function PhotoCompare({ condition, evidence }: { condition: Hex; evidence: Hex[] }) {
  const t = useT();
  const report = useDoc<ConditionReport>(condition);
  const ev0 = useDoc<Evidence>(evidence[0]);
  const ev1 = useDoc<Evidence>(evidence[1]);
  const before = report.doc?.items.flatMap((it) => it.photos.map((p) => ({ p, label: it.label }))) ?? [];
  const after = [...(ev0.doc?.photos ?? []).map((p) => ({ p, label: t.compare.landlord })), ...(ev1.doc?.photos ?? []).map((p) => ({ p, label: t.compare.tenant }))];
  const [b, setB] = useState(0);
  const [a, setA] = useState(0);
  const [pos, setPos] = useState(50);
  if (!before.length || !after.length) return null;
  const bi = Math.min(b, before.length - 1);
  const ai = Math.min(a, after.length - 1);
  const thumbs = (list: { p: Hex; label: string }[], sel: number, set: (i: number) => void) => (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {list.map((x, i) => (
        <button
          key={`${x.p}-${i}`}
          type="button"
          onClick={() => set(i)}
          title={x.label}
          className={cx("h-12 w-12 shrink-0 overflow-hidden border-2 transition-all", i === sel ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-100")}
        >
          <img src={fileUrl(x.p)} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold">{t.compare.title}</h2>
        <p className="text-sm text-zinc-400">{t.compare.lead}</p>
      </div>
      <div className="relative aspect-[4/3] w-full select-none overflow-hidden bg-zinc-900">
        <img src={fileUrl(after[ai].p)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={fileUrl(before[bi].p)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-zinc-900 shadow">⇆</span>
        </div>
        <span className="absolute left-2 top-2 bg-black/70 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white">{t.compare.before}</span>
        <span className="absolute right-2 top-2 bg-brand-500 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white">{t.compare.after}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={t.compare.title}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-zinc-400">{t.compare.before}: {before[bi].label}</p>
          {thumbs(before, bi, setB)}
        </div>
        <div>
          <p className="mb-1 text-xs text-zinc-400">{t.compare.after}: {after[ai].label}</p>
          {thumbs(after, ai, setA)}
        </div>
      </div>
    </div>
  );
}
