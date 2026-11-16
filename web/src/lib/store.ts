import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { get, list, put } from "@vercel/blob";

/**
 * Storage for everything that lives off-chain.
 *
 * - Files are content-addressed: each one is saved under its keccak256, which is the same
 *   hash that goes on-chain, so anyone can check that a photo or report was not changed.
 * - Records are small JSON documents kept in named collections (scam reports, AI reports).
 *
 * With BLOB_READ_WRITE_TOKEN set (Vercel Blob), data survives deploys and restarts.
 * Without it, data goes to a local folder, which is what you want on a laptop.
 */
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return process.env.VERCEL ? "/tmp/coc-data" : path.join(process.cwd(), ".data");
}

export function storageMode() {
  return useBlob() ? "vercel-blob" : "local-disk";
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------- content-addressed files

export async function putFile(hash: string, bytes: Uint8Array, contentType: string) {
  if (useBlob()) {
    await put(`files/${hash}`, Buffer.from(bytes), {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true, // same hash means same bytes, so overwriting is harmless
      cacheControlMaxAge: 31536000,
    });
    return;
  }
  const dir = path.join(dataDir(), "files");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, hash), bytes);
  await fs.writeFile(path.join(dir, `${hash}.type`), contentType);
}

export async function getFile(hash: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (useBlob()) {
    try {
      const res = await get(`files/${hash}`, { access: "public" });
      if (!res || res.statusCode !== 200) return null;
      return { bytes: await streamToBuffer(res.stream), contentType: res.blob.contentType || "application/octet-stream" };
    } catch {
      return null;
    }
  }
  const dir = path.join(dataDir(), "files");
  try {
    const bytes = await fs.readFile(path.join(dir, hash));
    const contentType = await fs.readFile(path.join(dir, `${hash}.type`), "utf8").catch(() => "application/octet-stream");
    return { bytes, contentType };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- named JSON records

const SAFE = /^[a-z0-9-]+$/;
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

export async function putRecord(collection: string, id: string, value: unknown) {
  if (!SAFE.test(collection) || !SAFE_ID.test(id)) throw new Error("Bad record name");
  const body = JSON.stringify(value);
  if (useBlob()) {
    await put(`records/${collection}/${id}.json`, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return;
  }
  const dir = path.join(dataDir(), "records", collection);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.json`), body);
}

export async function getRecord<T>(collection: string, id: string): Promise<T | null> {
  if (!SAFE.test(collection) || !SAFE_ID.test(id)) return null;
  if (useBlob()) {
    try {
      const res = await get(`records/${collection}/${id}.json`, { access: "public", useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse((await streamToBuffer(res.stream)).toString("utf8")) as T;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), "records", collection, `${id}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function listRecords<T>(collection: string, limit = 500): Promise<T[]> {
  if (!SAFE.test(collection)) return [];
  if (useBlob()) {
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `records/${collection}/`, cursor, limit: 1000 });
      for (const b of page.blobs) {
        if (out.length >= limit) break;
        const v = await getRecord<T>(collection, b.pathname.split("/").pop()!.replace(/\.json$/, ""));
        if (v) out.push(v);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && out.length < limit);
    return out;
  }
  const dir = path.join(dataDir(), "records", collection);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: T[] = [];
  for (const n of names.filter((x) => x.endsWith(".json")).slice(0, limit)) {
    try {
      out.push(JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as T);
    } catch {
      /* skip unreadable record */
    }
  }
  return out;
}
