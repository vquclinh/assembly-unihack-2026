"use client";

import { type Address, type Hex, encodeFunctionData, parseSignature, toHex } from "viem";
import { publicClient, chainNow } from "./client";
import type { Abi } from "viem";
import { BADGE, ESCROW, FORWARDER, TOKEN, badgeAbi, chain, escrowAbi, forwarderAbi, tokenAbi } from "./config";
import { AppError } from "./errors";

type Signer = {
  address: Address;
  signTypedData: (p: {
    domain: Record<string, unknown>;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
};

const FORWARD_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type Auth = { validAfter: bigint; validBefore: bigint; nonce: Hex; v: number; r: Hex; s: Hex };

export const EMPTY_AUTH: Auth = {
  validAfter: 0n,
  validBefore: 0n,
  nonce: `0x${"0".repeat(64)}`,
  v: 0,
  r: `0x${"0".repeat(64)}`,
  s: `0x${"0".repeat(64)}`,
};

/** How long Avalanche took to include each relayed transaction, and the gas fee Coc paid. */
export type TxInfo = { ms: number; fee: bigint };
const txInfo = new Map<string, TxInfo>();
export function rememberTx(hash: string, info: TxInfo) {
  txInfo.set(hash.toLowerCase(), info);
}
export function lookupTx(hash?: string) {
  return hash ? txInfo.get(hash.toLowerCase()) : undefined;
}

let tokenName: string | null = null;

/**
 * Signs a USDC transfer to the escrow (EIP-3009). Only the escrow contract can redeem it,
 * so nobody can front-run or redirect it. The user pays no gas and approves nothing.
 */
export async function signDepositAuth(signer: Signer, value: bigint): Promise<Auth> {
  if (!tokenName) tokenName = (await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "name" })) as string;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt((await chainNow()) + 3600);
  const sig = await signer.signTypedData({
    domain: { name: tokenName, version: "2", chainId: chain.id, verifyingContract: TOKEN },
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: { from: signer.address, to: ESCROW, value, validAfter: 0n, validBefore, nonce },
  });
  const p = parseSignature(sig);
  const v = p.v !== undefined ? Number(p.v) : p.yParity + 27;
  return { validAfter: 0n, validBefore, nonce, v, r: p.r, s: p.s };
}

/**
 * Sends a call to the escrow through the gasless relayer: the user signs, the server pays gas,
 * and the contract still sees the user as the sender (ERC-2771).
 */
export async function relayEscrowCall(signer: Signer, functionName: string, args: readonly unknown[]): Promise<Hex> {
  return relayCallRaw(signer, ESCROW, escrowAbi, functionName, args);
}

/** Claims the soulbound "Trusted landlord" badge without gas. */
export async function relayBadgeClaim(signer: Signer): Promise<Hex> {
  return relayCallRaw(signer, BADGE, badgeAbi, "claim", []);
}

/** Relays any call to one of Coc's contracts (the server refuses other targets). */
export async function relayCallRaw(signer: Signer, target: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<Hex> {
  const data = encodeFunctionData({ abi, functionName, args });
  const nonce = (await publicClient.readContract({
    address: FORWARDER,
    abi: forwarderAbi,
    functionName: "nonces",
    args: [signer.address],
  })) as bigint;
  const deadline = (await chainNow()) + 3600;
  const request = { from: signer.address, to: target, value: 0n, gas: 1_000_000n, nonce, deadline, data };
  const signature = await signer.signTypedData({
    domain: { name: "CocForwarder", version: "1", chainId: chain.id, verifyingContract: FORWARDER },
    types: FORWARD_TYPES,
    primaryType: "ForwardRequest",
    message: request,
  });
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request: { ...request, value: "0", gas: request.gas.toString(), nonce: nonce.toString() },
      signature,
    }),
  });
  const json = (await res.json()) as { hash?: Hex; error?: string; detail?: string; ms?: number; fee?: string };
  if (!res.ok || !json.hash) throw new AppError(json.error || "Unknown", json.detail);
  if (json.ms !== undefined) rememberTx(json.hash, { ms: json.ms, fee: BigInt(json.fee ?? "0") });
  return json.hash;
}
