"use client";

import { type Address, type Hex, keccak256, toHex } from "viem";
import { chainNow } from "./client";
import { chain } from "./config";
import { AppError } from "./errors";
import type { AiReport } from "./lease";

export type Requirements = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: Address;
  asset: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

type Signer = {
  address: Address;
  signTypedData: (p: {
    domain: Record<string, unknown>;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
};

/** Reads the x402 quote for a lease's AI report, or the report itself if someone already paid. */
export async function aiQuote(leaseId: string): Promise<{ report?: AiReport; req?: Requirements; error?: string }> {
  const res = await fetch(`/api/ai-report/${leaseId}?quote=1`);
  const json = await res.json();
  if (res.ok && json.report) return { report: json.report };
  if ((res.ok || res.status === 402) && json.accepts?.[0]) return { req: json.accepts[0] };
  return { error: json.error ?? "Unknown" };
}

const ZERO = /^0x0{64}$/;
const BUDGET = 2_800_000; // keeps the request under the 4.5 MB body limit of serverless functions

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Collects the documents and photos the report is built from, so the service can check them
 * against their on-chain hashes instead of reading them back from storage.
 */
async function collectInputs(leaseId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let used = 0;
  const load = async (hash: string) => {
    if (!hash || ZERO.test(hash) || out[hash]) return null;
    const res = await fetch(`/api/files/${hash}`).catch(() => null);
    if (!res?.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (keccak256(bytes) !== hash.toLowerCase() || used + bytes.length > BUDGET) return null;
    used += bytes.length;
    out[hash.toLowerCase()] = toBase64(bytes);
    return bytes;
  };
  try {
    const q = await (await fetch(`/api/ai-report/${leaseId}?quote=1`)).json();
    const inputs = (q.inputs ?? {}) as Record<string, string>;
    const photos: string[] = [];
    for (const h of [inputs.condition, inputs.landlordEvidence, inputs.tenantEvidence]) {
      const bytes = await load(h);
      if (!bytes) continue;
      const d = JSON.parse(new TextDecoder().decode(bytes)) as { photos?: string[]; items?: { photos?: string[] }[] };
      photos.push(...(d.photos ?? []), ...(d.items ?? []).flatMap((it) => it.photos ?? []));
    }
    for (const p of photos) await load(p);
  } catch {
    // The service falls back to reading from storage.
  }
  return out;
}

/**
 * Pays for the AI damage report with x402 ("exact" scheme): an EIP-3009 authorization for
 * exactly the quoted amount to the service, sent in the X-PAYMENT header. No AVAX needed.
 */
export async function buyAiReport(signer: Signer, leaseId: string, req: Requirements, lang: string, onPaid?: () => void): Promise<AiReport> {
  const files = await collectInputs(leaseId);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt((await chainNow()) + req.maxTimeoutSeconds);
  const authorization = { from: signer.address, to: req.payTo, value: req.maxAmountRequired, validAfter: "0", validBefore: validBefore.toString(), nonce };
  const signature = await signer.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId: chain.id, verifyingContract: req.asset },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: { ...authorization, value: BigInt(req.maxAmountRequired), validAfter: 0n, validBefore },
  });
  const header = btoa(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { signature, authorization } }));
  onPaid?.();
  const res = await fetch(`/api/ai-report/${leaseId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-payment": header },
    body: JSON.stringify({ lang, files }),
  });
  const json = await res.json();
  if (!res.ok || !json.report) throw new AppError(json.error || "Unknown", json.detail);
  return json.report as AiReport;
}
