import { NextResponse } from "next/server";
import { chain } from "@/lib/config";

/**
 * Read-only JSON-RPC proxy for the browser.
 *
 * The public Fuji RPC rate-limits by IP, and its 429 replies carry no CORS headers, so the
 * browser only sees "NetworkError". With three panels polling at once (the judge demo),
 * that happens quickly. Going through the server lets us share identical in-flight requests,
 * retry on 429 with backoff, and keep the RPC URL configurable.
 */
const UPSTREAM = process.env.RPC_URL || chain.rpcUrls.default.http[0];

const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "net_version",
]);

type Req = { jsonrpc: "2.0"; id: number | string | null; method: string; params?: unknown[] };

// Identical requests that arrive while one is already in flight share its answer. Nothing is
// kept after it resolves: a stale forwarder nonce would make the next signed action fail.
const inflight = new Map<string, Promise<{ status: number; text: string }>>();

async function upstream(body: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store" });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
      continue;
    }
    return { status: res.status, text: await res.text() };
  }
}

export async function POST(req: Request) {
  let parsed: Req | Req[];
  try {
    parsed = (await req.json()) as Req | Req[];
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0 || list.length > 50 || list.some((r) => !ALLOWED.has(r?.method))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: `Method not allowed through this proxy: ${list.map((r) => r?.method).filter((m) => !ALLOWED.has(m)).join(", ")}` } }, { status: 400 });
  }

  // Upstream ids are positions (0..n-1), so a shared answer serves every caller, and each
  // caller gets its own ids back.
  const key = JSON.stringify(list.map((r) => [r.method, r.params ?? []]));
  let pending = inflight.get(key);
  if (!pending) {
    const body = JSON.stringify(list.map((r, i) => ({ jsonrpc: "2.0", id: i, method: r.method, params: r.params ?? [] })));
    pending = upstream(body).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    const { status, text } = await pending;
    if (status !== 200) {
      return new NextResponse(text, { status, headers: { "content-type": "application/json" } });
    }
    const raw = JSON.parse(text) as { id: number }[] | { id: number };
    const answers = Array.isArray(raw) ? raw : [raw];
    const out = list.map((r, i) => ({ ...(answers.find((a) => a.id === i) ?? answers[i]), id: r.id }));
    return NextResponse.json(Array.isArray(parsed) ? out : out[0]);
  } catch (e) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: (e as Error).message } }, { status: 502 });
  }
}
