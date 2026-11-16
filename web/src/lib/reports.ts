import type { Address, Hex } from "viem";
import { chain } from "./config";

/** Community scam reports. Signed by a wallet so each wallet can file one report per landlord. */
export const REPORT_REASONS = ["fake_listing", "pay_outside", "misleading", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DOMAIN = { name: "Coc", version: "1", chainId: chain.id } as const;
export const REPORT_TYPES = {
  ScamReport: [
    { name: "landlord", type: "address" },
    { name: "leaseId", type: "uint256" },
    { name: "reason", type: "string" },
    { name: "note", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

export type ScamReport = {
  landlord: Address;
  reporter: Address;
  leaseId: string;
  reason: ReportReason;
  note: string;
  timestamp: number;
  signature: Hex;
};
