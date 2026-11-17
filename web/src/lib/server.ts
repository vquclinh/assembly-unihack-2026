import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { type Abi, type Address, type Hex, createPublicClient, createWalletClient, decodeErrorResult, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { allErrorsAbi, chain } from "./config";

export const serverPublic = createPublicClient({ chain, transport: http(process.env.RPC_URL || undefined, { batch: true, retryCount: 4 }) });

/** Falls back to the deployer key in contracts/.env so local setup needs one key file only. */
function keyFromContractsEnv() {
  try {
    const text = readFileSync(path.join(process.cwd(), "..", "contracts", ".env"), "utf8");
    return text.match(/^PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export function relayerWallet() {
  const pk = process.env.RELAYER_PRIVATE_KEY?.trim() || keyFromContractsEnv();
  if (!pk) return null;
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  return createWalletClient({ account, chain, transport: http(process.env.RPC_URL || undefined, { retryCount: 4 }) });
}

type Write = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; gas?: bigint };

/** Submissions from this server instance go out one at a time, so two never pick the same nonce. */
let queue: Promise<unknown> = Promise.resolve();
/** Fee cap floor of 2 gwei: a 500k-gas call needs 0.001 AVAX in the wallet to send, but pays far less. */
const MIN_FEE_CAP = 2_000_000_000n;
const NONCE_CLASH = /nonce|replacement transaction|already known|underpriced/i;

/**
 * Sends a transaction from the relayer wallet (relay, faucet, keeper, x402 settlement all
 * share it). Calls are serialized and the nonce is read from the pending pool each time; if
 * another instance took the same nonce, it waits a moment and tries again.
 */
export async function relayerWrite(w: Write): Promise<Hex> {
  const wallet = relayerWallet();
  if (!wallet) throw new Error("NoRelayer");
  const job = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const [nonce, fees] = await Promise.all([
          serverPublic.getTransactionCount({ address: wallet.account.address, blockTag: "pending" }),
          serverPublic.estimateFeesPerGas(),
        ]);
        // Avalanche's base fee can jump several times over within seconds. A fee cap of only 1.2x
        // the current base fee (viem's default) then leaves the transaction waiting until it falls
        // back. The cap is only a ceiling: the network charges base fee + tip, so headroom is free.
        const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
        const cap = fees.maxFeePerGas * 4n;
        const maxFeePerGas = (cap > MIN_FEE_CAP ? cap : MIN_FEE_CAP) + maxPriorityFeePerGas;
        return await wallet.writeContract({ ...w, nonce, maxFeePerGas, maxPriorityFeePerGas } as Parameters<typeof wallet.writeContract>[0]);
      } catch (e) {
        const msg = String((e as { details?: string; message?: string }).details ?? (e as Error).message);
        if (attempt >= 3 || !NONCE_CLASH.test(msg)) throw e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1) + Math.random() * 250));
      }
    }
  });
  queue = job.catch(() => {});
  return job;
}

/** A Fuji block takes about 2 seconds; a transaction not mined after this is stuck behind another one. */
const RECEIPT_TIMEOUT_MS = 45_000;

/** Sends through the relayer and waits for the block, timing how long Avalanche took to finalize it. */
export async function relayerWriteAndWait(w: Write) {
  const started = Date.now();
  const hash = await relayerWrite(w);
  let receipt;
  try {
    receipt = await serverPublic.waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: RECEIPT_TIMEOUT_MS });
  } catch (e) {
    if ((e as Error).name !== "WaitForTransactionReceiptTimeoutError") throw e;
    console.error(`[relayer] ${hash} not mined after ${RECEIPT_TIMEOUT_MS / 1000}s. Run "npm run relayer" in web/ to check for stuck transactions.`);
    throw Object.assign(new Error("RelayerStuck"), { shortMessage: `RelayerStuck: ${hash}` });
  }
  return {
    hash,
    receipt,
    ms: Date.now() - started,
    fee: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
  };
}

/** Digs the revert data out of a viem error and decodes it against all our ABIs. */
export function decodeRevert(err: unknown): { code?: string; detail: string } {
  let e: unknown = err;
  let data: Hex | undefined;
  for (let i = 0; i < 10 && e; i++) {
    const d = (e as { data?: unknown }).data;
    if (typeof d === "string" && d.startsWith("0x")) {
      data = d as Hex;
      break;
    }
    if (d && typeof d === "object" && typeof (d as { data?: unknown }).data === "string") {
      data = (d as { data: Hex }).data;
      break;
    }
    e = (e as { cause?: unknown }).cause;
  }
  const detail = (err as { shortMessage?: string; message?: string }).shortMessage || String(err);
  if (/insufficient funds/i.test(String((err as { message?: string }).message ?? detail))) return { code: "RelayerEmpty", detail };
  if ((err as Error)?.message === "RelayerStuck") return { code: "RelayerStuck", detail };
  if (!data || data === "0x") return { detail };
  try {
    const r = decodeErrorResult({ abi: allErrorsAbi, data });
    if (r.errorName === "Error") return { code: undefined, detail: String(r.args?.[0] ?? detail) };
    return { code: r.errorName, detail };
  } catch {
    return { detail };
  }
}
