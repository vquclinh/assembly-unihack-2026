"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { type Hex, zeroHash } from "viem";
import { fetchJson, fileUrl, uploadJson, uploadPhoto } from "@/lib/files";
import { errorText } from "@/lib/errors";
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
      <p className="mt-3 break-all font-mono text-[11px] text-zinc-500">hash {hash}</p>
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
async function sampleFile(name: string) {
  const res = await fetch(`/demo/${name}`);
  return new File([await res.blob()], name, { type: "image/jpeg" });
}

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
        <button
          type="button"
          className="font-mono text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
          onClick={async () => {
            const names = ["wall-clean.jpg", "floor.jpg", "bathroom.jpg"];
            const files = await Promise.all(names.map(sampleFile));
            setItems(items.map((x, i) => (i < names.length ? { ...x, note: t.docs.sampleNotes[i], files: [files[i]] } : x)));
          }}
        >
          {t.docs.samplePhotos}
        </button>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <Button className="w-full" loading={uploading || busy} onClick={submit}>
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
      <textarea className={inputCls} rows={3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <PhotoPicker files={files} onChange={setFiles} />
      <button
        type="button"
        className="font-mono text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
        onClick={async () => {
          setFiles([await sampleFile(role === "landlord" ? "wall-stain.jpg" : "wall-clean.jpg")]);
          if (!text.trim()) setText(role === "landlord" ? t.docs.sampleLandlordText : t.docs.sampleTenantText);
        }}
      >
        {t.docs.samplePhotos}
      </button>
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
