import "server-only";
import { type Hex, decodeEventLog, numberToHex, pad } from "viem";
import { D, ESCROW, escrowAbi } from "./config";
import { serverPublic } from "./server";

export type HistoryEvent = {
  name: string;
  args: Record<string, string | boolean>;
  block: string;
  time: number | null;
  tx: Hex;
  logIndex: number;
};

const cache = new Map<string, { at: number; events: HistoryEvent[] }>();
/** Public Fuji RPC nodes refuse eth_getLogs over more than 2048 blocks. */
const CHUNK = 2000n;
const MAX_CHUNKS = 60;

function serialize(args: Record<string, unknown>) {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === "boolean" ? v : String(v);
  return out;
}

function decode(log: { topics: Hex[]; data: Hex }) {
  try {
    const d = decodeEventLog({ abi: escrowAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data });
    return { name: String(d.eventName), args: serialize((d.args ?? {}) as Record<string, unknown>) };
  } catch {
    return null;
  }
}

/** Routescan (the Snowtrace backend) returns a lease's logs over the whole chain in one call. */
async function fromRoutescan(id: bigint): Promise<HistoryEvent[] | null> {
  if (D.chainId !== 43113 && D.chainId !== 43114) return null;
  const net = D.chainId === 43113 ? "testnet" : "mainnet";
  const url =
    `https://api.routescan.io/v2/network/${net}/evm/${D.chainId}/etherscan/api?module=logs&action=getLogs` +
    `&address=${ESCROW}&fromBlock=${D.deployBlock ?? 0}&toBlock=latest&topic1=${pad(numberToHex(id))}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "coc-history/1.0" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      message?: string;
      result?: { topics: Hex[]; data: Hex; blockNumber: Hex; timeStamp: Hex; transactionHash: Hex; logIndex: Hex }[] | string;
    };
    if (!Array.isArray(json.result)) return json.message === "No records found" ? [] : null;
    const out: HistoryEvent[] = [];
    for (const l of json.result) {
      const d = decode(l);
      if (!d) continue;
      out.push({
        ...d,
        block: BigInt(l.blockNumber).toString(),
        time: Number(BigInt(l.timeStamp)),
        tx: l.transactionHash,
        logIndex: l.logIndex === "0x" ? 0 : Number(BigInt(l.logIndex)),
      });
    }
    return out;
  } catch {
    return null;
  }
}

type RawLog = { topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex };

/** Fallback: walk back from the latest block in chunks until the lease's OfferCreated event. */
async function fromRpc(id: bigint, maxChunks = MAX_CHUNKS): Promise<HistoryEvent[]> {
  const latest = await serverPublic.getBlockNumber();
  const floor = BigInt(D.deployBlock ?? 0);
  const topic = pad(numberToHex(id));
  const logs: RawLog[] = [];
  const local = D.chainId === 31337;
  let to = latest;
  for (let i = 0; i < (local ? 1 : maxChunks) && to >= floor; i++) {
    const from = local ? floor : to - CHUNK + 1n > floor ? to - CHUNK + 1n : floor;
    const chunk = (await serverPublic.request({
      method: "eth_getLogs",
      params: [{ address: ESCROW, fromBlock: numberToHex(from), toBlock: numberToHex(to), topics: [null, topic] }],
    } as never)) as RawLog[];
    logs.unshift(...chunk);
    if (chunk.some((l) => decode(l)?.name === "OfferCreated")) break;
    to = from - 1n;
  }
  const blocks = new Map<string, number>();
  await Promise.all(
    [...new Set(logs.map((l) => l.blockNumber))].map(async (b) => blocks.set(b, Number((await serverPublic.getBlock({ blockNumber: BigInt(b) })).timestamp))),
  );
  const out: HistoryEvent[] = [];
  for (const l of logs) {
    const d = decode(l);
    if (!d) continue;
    out.push({ ...d, block: BigInt(l.blockNumber).toString(), time: blocks.get(l.blockNumber) ?? null, tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)) });
  }
  return out;
}

/** Every event the escrow emitted for one lease, oldest first. Cached for a few seconds. */
export async function leaseHistory(id: bigint, fresh = false): Promise<HistoryEvent[]> {
  const key = id.toString();
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 6000) return hit.events;
  // Every event we index has the lease id as its first indexed field; drop anything else.
  const indexed = await fromRoutescan(id);
  let all: HistoryEvent[];
  if (indexed === null) all = await fromRpc(id);
  else {
    // Routescan indexes a few seconds behind the chain: add the newest blocks straight from the RPC.
    const tail = await fromRpc(id, 1).catch(() => [] as HistoryEvent[]);
    const seen = new Set(indexed.map((e) => `${e.tx.toLowerCase()}-${e.logIndex}`));
    all = [...indexed, ...tail.filter((e) => !seen.has(`${e.tx.toLowerCase()}-${e.logIndex}`))];
  }
  const events = all.filter((e) => e.args.id === key);
  events.sort((a, b) => (BigInt(a.block) === BigInt(b.block) ? a.logIndex - b.logIndex : BigInt(a.block) < BigInt(b.block) ? -1 : 1));
  cache.set(key, { at: Date.now(), events });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return events;
}
