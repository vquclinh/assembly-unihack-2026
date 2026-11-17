import type { Address, Hex } from "viem";

export const Status = {
  None: 0,
  Offered: 1,
  Reserved: 2,
  Active: 3,
  ReleaseRequested: 4,
  SettlementProposed: 5,
  NoShowClaimed: 6,
  Disputed: 7,
  Closed: 8,
  Cancelled: 9,
} as const;

export const STATUS_TONE: Record<number, "neutral" | "info" | "good" | "warn" | "bad"> = {
  0: "neutral",
  1: "info",
  2: "info",
  3: "good",
  4: "warn",
  5: "warn",
  6: "bad",
  7: "bad",
  8: "neutral",
  9: "neutral",
};

export type Lease = {
  landlord: Address;
  tenant: Address;
  mediator: Address;
  holdAmount: bigint;
  depositAmount: bigint;
  balance: bigint;
  proposedDeduction: bigint;
  disputedAmount: bigint;
  shares: bigint;
  moveInDeadline: bigint;
  leaseEnd: bigint;
  activatedAt: bigint;
  actionAt: bigint;
  /** Seconds each side has to answer, chosen per lease when the offer is created. */
  responseWindow: number;
  /** Seconds the mediator has to rule before the disputed amount is split 50/50. */
  mediationTimeout: number;
  status: number;
  landlordYieldOptIn: boolean;
  yieldOn: boolean;
  termsHash: Hex;
  conditionHash: Hex;
  landlordEvidence: Hex;
  tenantEvidence: Hex;
  rulingHash: Hex;
};

export type Stats = {
  completed: number;
  amicable: number;
  disputes: number;
  disputesLost: number;
  timeouts: number;
  ghosted: number;
  valueSeconds: bigint;
};

export function toStats(raw: readonly unknown[]): Stats {
  const [completed, amicable, disputes, disputesLost, timeouts, ghosted, valueSeconds] = raw as [
    number, number, number, number, number, number, bigint,
  ];
  return {
    completed: Number(completed),
    amicable: Number(amicable),
    disputes: Number(disputes),
    disputesLost: Number(disputesLost),
    timeouts: Number(timeouts),
    ghosted: Number(ghosted),
    valueSeconds: BigInt(valueSeconds),
  };
}

/** Index into the five-step progress bar shown at the top of a lease. */
export function stepIndex(status: number) {
  switch (status) {
    case Status.Offered:
      return 0;
    case Status.Reserved:
    case Status.NoShowClaimed:
      return 1;
    case Status.Active:
      return 2;
    case Status.ReleaseRequested:
    case Status.SettlementProposed:
    case Status.Disputed:
      return 3;
    default:
      return 4;
  }
}

/** Off-chain documents. Each one is stored as JSON and referenced on-chain by its keccak256. */
export type Terms = {
  kind: "terms";
  v: 1;
  title: string;
  address: string;
  rentVnd: number;
  depositVnd: number;
  holdVnd: number;
  notes: string;
  /** Optional: listed on the public "Find a room" page. */
  listed?: boolean;
  /** Optional room photos, by content hash. */
  photos?: Hex[];
  createdAt: string;
};

export type ReportItem = { label: string; note: string; photos: Hex[] };

export type ConditionReport = {
  kind: "condition";
  v: 1;
  leaseId: string;
  items: ReportItem[];
  createdAt: string;
};

export type Evidence = {
  kind: "evidence";
  v: 1;
  leaseId: string;
  role: "landlord" | "tenant";
  text: string;
  photos: Hex[];
  createdAt: string;
};

export type Ruling = {
  kind: "ruling";
  v: 1;
  leaseId: string;
  text: string;
  toTenant: string;
  createdAt: string;
};

/**
 * The first second at which anyone may call `finalize` on this lease, or null if the
 * current status has no deadline. Mirrors the TooEarly checks in CocEscrow.finalize.
 */
export function finalizeDueAt(L: Pick<Lease, "status" | "moveInDeadline" | "actionAt" | "responseWindow" | "mediationTimeout">) {
  const rw = Number(L.responseWindow);
  switch (L.status) {
    case Status.Reserved:
      return Number(L.moveInDeadline) + rw + 1;
    case Status.NoShowClaimed:
    case Status.ReleaseRequested:
    case Status.SettlementProposed:
      return Number(L.actionAt) + rw + 1;
    case Status.Disputed:
      return Number(L.actionAt) + Number(L.mediationTimeout) + 1;
    default:
      return null;
  }
}

/** Off-chain AI damage assessment, paid per report over x402. */
export type AiReport = {
  kind: "ai-report";
  v: 1;
  leaseId: string;
  model: string;
  inputs: { condition: Hex; landlordEvidence: Hex; tenantEvidence: Hex };
  summary: string;
  findings: { area: string; observation: string; preExisting: "yes" | "no" | "unclear"; severity: "none" | "minor" | "moderate" | "major" }[];
  suggestedDeductionPct: number;
  confidence: "low" | "medium" | "high";
  caveats: string;
  payment: { payer: Address; amount: string; tx: Hex };
  createdAt: string;
};
