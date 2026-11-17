"use client";

import { type Address, type Hex, toHex } from "viem";
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

/**
 * Pays for the AI damage report with x402 ("exact" scheme): an EIP-3009 authorization for
 * exactly the quoted amount to the service, sent in the X-PAYMENT header. No AVAX needed.
 */
export async function buyAiReport(signer: Signer, leaseId: string, req: Requirements, lang: string, onPaid?: () => void): Promise<AiReport> {
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
    body: JSON.stringify({ lang }),
  });
  const json = await res.json();
  if (!res.ok || !json.report) throw new AppError(json.error || "Unknown", json.detail);
  return json.report as AiReport;
}
