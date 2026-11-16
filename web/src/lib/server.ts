import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { type Hex, createPublicClient, createWalletClient, decodeErrorResult, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { allErrorsAbi, chain } from "./config";

export const serverPublic = createPublicClient({ chain, transport: http(undefined, { batch: true }) });

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
  return createWalletClient({ account, chain, transport: http() });
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
  if (!data || data === "0x") return { detail };
  try {
    const r = decodeErrorResult({ abi: allErrorsAbi, data });
    if (r.errorName === "Error") return { code: undefined, detail: String(r.args?.[0] ?? detail) };
    return { code: r.errorName, detail };
  } catch {
    return { detail };
  }
}
