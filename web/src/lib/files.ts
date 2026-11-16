"use client";

import { type Hex, keccak256, toBytes } from "viem";
import { AppError } from "./errors";

/** Uploads bytes to the content-addressed store. Returns the keccak256 of the bytes. */
export async function uploadBytes(bytes: Uint8Array, contentType: string): Promise<Hex> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes as BodyInit,
  });
  const json = await res.json();
  if (!res.ok) throw new AppError(json.error || "UploadFailed");
  return json.hash as Hex;
}

export async function uploadJson(doc: unknown): Promise<Hex> {
  const text = JSON.stringify(doc);
  const bytes = toBytes(text);
  const hash = await uploadBytes(bytes, "application/json");
  if (hash !== keccak256(bytes)) throw new AppError("HashMismatch");
  return hash;
}

/** Fetches a document and checks that it really is the one whose hash is on-chain. */
export async function fetchJson<T>(hash: Hex): Promise<{ doc: T; verified: boolean } | null> {
  const res = await fetch(`/api/files/${hash}`);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const verified = keccak256(bytes) === hash.toLowerCase();
  return { doc: JSON.parse(new TextDecoder().decode(bytes)) as T, verified };
}

export function fileUrl(hash: Hex) {
  return `/api/files/${hash}`;
}

/** Shrinks a photo to at most 1280px and re-encodes it as JPEG so uploads stay small. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new AppError("ImageFailed"))), "image/jpeg", quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function uploadPhoto(file: File): Promise<Hex> {
  return uploadBytes(await compressImage(file), "image/jpeg");
}
