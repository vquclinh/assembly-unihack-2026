import "server-only";
import { type Address, type Hex, getAddress, isAddress, isHex, parseSignature, parseUnits, verifyTypedData } from "viem";
import { D, TOKEN, chain, tokenAbi } from "./config";
import { relayerWallet, relayerWriteAndWait, serverPublic } from "./server";

/**
 * Minimal x402 ("HTTP 402 Payment Required") server for pay-per-request APIs.
 *
 * The client first gets a 402 with the payment requirements, signs an EIP-3009 USDC
 * authorization for exactly that amount, and retries with it in the X-PAYMENT header.
 * The server verifies the signature, does the paid work, then settles the payment on
 * Avalanche itself (it acts as its own facilitator) and returns the receipt in
 * X-PAYMENT-RESPONSE. The payer needs no AVAX: the service pays the gas.
 */

export const X402_VERSION = 1;

export function priceUnits() {
  return parseUnits(process.env.AI_REPORT_PRICE_USDC || "0.10", 6);
}

export function networkName() {
  return D.chainId === 43113 ? "avalanche-fuji" : D.chainId === 43114 ? "avalanche" : `eip155:${D.chainId}`;
}

let tokenName: string | null = null;
async function getTokenName() {
  if (!tokenName) tokenName = (await serverPublic.readContract({ address: TOKEN, abi: tokenAbi, functionName: "name" })) as string;
  return tokenName;
}

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: { name: string; version: string; method: "receiveWithAuthorization" };
};

export async function requirements(resource: string, description: string): Promise<PaymentRequirements | null> {
  const wallet = relayerWallet();
  if (!wallet) return null;
  return {
    scheme: "exact",
    network: networkName(),
    maxAmountRequired: priceUnits().toString(),
    resource,
    description,
    mimeType: "application/json",
    payTo: wallet.account.address,
    maxTimeoutSeconds: 300,
    asset: TOKEN,
    extra: { name: await getTokenName(), version: "2", method: "receiveWithAuthorization" },
  };
}

export function paymentRequiredBody(req: PaymentRequirements, error = "X-PAYMENT header is required") {
  return { x402Version: X402_VERSION, error, accepts: [req] };
}

type Authorization = { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex };
export type VerifiedPayment = { auth: Authorization; signature: Hex };

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

/** Decodes and checks an X-PAYMENT header. Throws a short error code on any problem. */
export async function verifyPayment(header: string | null, req: PaymentRequirements): Promise<VerifiedPayment> {
  if (!header) throw new Error("PaymentMissing");
  let p: { x402Version?: number; scheme?: string; network?: string; payload?: { signature?: string; authorization?: Authorization } };
  try {
    p = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    throw new Error("PaymentMalformed");
  }
  const auth = p.payload?.authorization;
  const signature = p.payload?.signature;
  if (p.x402Version !== X402_VERSION || p.scheme !== "exact" || p.network !== req.network) throw new Error("PaymentWrongScheme");
  if (!auth || !signature || !isHex(signature) || !isAddress(auth.from) || !isAddress(auth.to) || !isHex(auth.nonce)) throw new Error("PaymentMalformed");
  if (getAddress(auth.to) !== getAddress(req.payTo)) throw new Error("PaymentWrongRecipient");
  if (BigInt(auth.value) < BigInt(req.maxAmountRequired)) throw new Error("PaymentTooSmall");

  const now = Number((await serverPublic.getBlock({ blockTag: "latest" })).timestamp);
  if (BigInt(auth.validBefore) < BigInt(now + 30) || BigInt(auth.validAfter) >= BigInt(now)) throw new Error("PaymentExpired");

  const ok = await verifyTypedData({
    address: auth.from,
    domain: { name: req.extra.name, version: req.extra.version, chainId: chain.id, verifyingContract: req.asset },
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
    signature: signature as Hex,
  });
  if (!ok) throw new Error("PaymentBadSignature");

  const [balance, used] = await Promise.all([
    serverPublic.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [auth.from] }) as Promise<bigint>,
    serverPublic.readContract({ address: TOKEN, abi: tokenAbi, functionName: "authorizationState", args: [auth.from, auth.nonce] }) as Promise<boolean>,
  ]);
  if (used) throw new Error("PaymentReplayed");
  if (balance < BigInt(auth.value)) throw new Error("PaymentInsufficientFunds");
  return { auth, signature: signature as Hex };
}

/** Moves the USDC on-chain. The service wallet is the payee and pays the gas. */
export async function settlePayment(v: VerifiedPayment): Promise<Hex> {
  const sig = parseSignature(v.signature);
  const vByte = sig.v !== undefined ? Number(sig.v) : sig.yParity + 27;
  const { hash, receipt } = await relayerWriteAndWait({
    address: TOKEN,
    abi: tokenAbi,
    functionName: "receiveWithAuthorization",
    args: [v.auth.from, v.auth.to, BigInt(v.auth.value), BigInt(v.auth.validAfter), BigInt(v.auth.validBefore), v.auth.nonce, vByte, sig.r, sig.s],
  });
  if (receipt.status !== "success") throw new Error("PaymentSettleFailed");
  return hash;
}

export function paymentResponseHeader(tx: Hex, payer: Address) {
  return Buffer.from(JSON.stringify({ success: true, transaction: tx, network: networkName(), payer })).toString("base64");
}
