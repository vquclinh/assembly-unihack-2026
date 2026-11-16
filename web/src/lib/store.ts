import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Content-addressed file store: every file is saved under its keccak256, which is the
 * same hash that goes on-chain. In production this would be IPFS; the interface is identical.
 */
export function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return process.env.VERCEL ? "/tmp/coc-data" : path.join(process.cwd(), ".data");
}

export async function putFile(hash: string, bytes: Uint8Array, contentType: string) {
  const dir = path.join(dataDir(), "files");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, hash), bytes);
  await fs.writeFile(path.join(dir, `${hash}.type`), contentType);
}

export async function getFile(hash: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const dir = path.join(dataDir(), "files");
  try {
    const bytes = await fs.readFile(path.join(dir, hash));
    const contentType = await fs.readFile(path.join(dir, `${hash}.type`), "utf8").catch(() => "application/octet-stream");
    return { bytes, contentType };
  } catch {
    return null;
  }
}
