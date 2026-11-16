import { type Abi, type Address, defineChain, zeroAddress } from "viem";
import { avalancheFuji, hardhat } from "viem/chains";
import abis from "./abis.json";
import deployment from "./deployment.json";

export type Deployment = {
  network: string;
  chainId: number;
  token: string;
  mockToken: boolean;
  vault: string;
  forwarder: string;
  escrow: string;
  badge?: string;
  badgeMinCompleted?: number;
  responseWindow: number;
  mediationTimeout: number;
  rpcUrl: string;
  explorer: string;
};

export const D = deployment as Deployment;

export const isDeployed = /^0x[0-9a-fA-F]{40}$/.test(D.escrow) && D.escrow !== zeroAddress;

export const ESCROW = D.escrow as Address;
export const TOKEN = D.token as Address;
export const FORWARDER = D.forwarder as Address;
export const VAULT = D.vault as Address;
export const BADGE = (D.badge ?? "") as Address;
export const hasBadge = /^0x[0-9a-fA-F]{40}$/.test(BADGE);

export const escrowAbi = abis.CocEscrow as Abi;
export const forwarderAbi = abis.CocForwarder as Abi;
export const tokenAbi = abis.MockUSDC as Abi;
export const badgeAbi = abis.CocBadge as Abi;

/** Every error any of our contracts can throw, for decoding reverts. */
export const allErrorsAbi = [...escrowAbi, ...forwarderAbi, ...tokenAbi, ...badgeAbi].filter(
  (x) => (x as { type: string }).type === "error",
) as Abi;

const baseChain = D.chainId === 43113 ? avalancheFuji : D.chainId === 31337 ? hardhat : undefined;

export const chain = defineChain({
  ...(baseChain ?? {
    id: D.chainId,
    name: D.network,
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  }),
  rpcUrls: { default: { http: [D.rpcUrl || baseChain?.rpcUrls.default.http[0] || "http://127.0.0.1:8545"] } },
} as Parameters<typeof defineChain>[0]);

export const VND_PER_USDC = Number(process.env.NEXT_PUBLIC_VND_PER_USDC || 26000);
export const USDC_DECIMALS = 6;

export function explorerTx(hash: string) {
  return D.explorer ? `${D.explorer}/tx/${hash}` : "";
}
export function explorerAddress(addr: string) {
  return D.explorer ? `${D.explorer}/address/${addr}` : "";
}
