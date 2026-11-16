"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type Address, type Hex, createWalletClient, custom, numberToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chain } from "./config";
import { AppError } from "./errors";

type SignTypedDataParams = {
  domain: Record<string, unknown>;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

type StoredAccount =
  | { id: string; label: string; kind: "quick"; pk: Hex; address: Address }
  | { id: string; label: string; kind: "injected"; address: Address };

export type WalletAccount = Omit<StoredAccount, "pk"> & { kind: "quick" | "injected" };

type WalletCtx = {
  ready: boolean;
  accounts: WalletAccount[];
  active: WalletAccount | null;
  select: (id: string) => void;
  createQuick: (label: string) => WalletAccount;
  connectInjected: (label: string) => Promise<void>;
  rename: (id: string, label: string) => void;
  remove: (id: string) => void;
  signTypedData: (p: SignTypedDataParams) => Promise<Hex>;
  /** Signs with a specific quick wallet, whichever one is active (used by the judge demo). */
  signTypedDataAs: (id: string, p: SignTypedDataParams) => Promise<Hex>;
  hasInjected: boolean;
  /** True when this page was opened with ?as=<walletId>, e.g. one column of the judge demo. */
  pinned: boolean;
};

const Ctx = createContext<WalletCtx | null>(null);
const KEY = "coc.accounts.v1";
const ACTIVE_KEY = "coc.active.v1";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
function injected(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

function load(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as StoredAccount[];
  } catch {
    return [];
  }
}

function save(list: StoredAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

async function ensureChain(eth: Eip1193) {
  const hexId = numberToHex(chain.id);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
        },
      ],
    });
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<StoredAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);
  const [pinned, setPinned] = useState(false);
  const listRef = useRef<StoredAccount[]>([]);
  const pinnedRef = useRef(false);

  useEffect(() => {
    const l = load();
    listRef.current = l;
    setList(l);
    let a: string | null = null;
    try {
      a = localStorage.getItem(ACTIVE_KEY);
    } catch {}
    // ?as=<walletId> pins this tab or frame to one wallet without changing the others.
    const as = new URLSearchParams(window.location.search).get("as");
    if (as && l.some((x) => x.id === as)) {
      a = as;
      pinnedRef.current = true;
      setPinned(true);
    }
    setActiveId(l.find((x) => x.id === a)?.id ?? l[0]?.id ?? null);
    setHasInjected(!!injected());
    setReady(true);
  }, []);

  const persist = useCallback((next: StoredAccount[], nextActive: string | null) => {
    listRef.current = next;
    setList(next);
    setActiveId(nextActive);
    save(next);
    if (pinnedRef.current) return;
    try {
      if (nextActive) localStorage.setItem(ACTIVE_KEY, nextActive);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, []);

  const select = useCallback((id: string) => persist(listRef.current, id), [persist]);

  const createQuick = useCallback(
    (label: string) => {
      const pk = generatePrivateKey();
      const address = privateKeyToAccount(pk).address;
      const acc: StoredAccount = { id: crypto.randomUUID(), label: label || "Quick wallet", kind: "quick", pk, address };
      persist([...listRef.current, acc], acc.id);
      return { id: acc.id, label: acc.label, kind: acc.kind, address };
    },
    [persist],
  );

  const connectInjected = useCallback(async (label: string) => {
    const eth = injected();
    if (!eth) throw new AppError("NoInjected");
    const addrs = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
    if (!addrs[0]) throw new AppError("NoAddress");
    await ensureChain(eth);
    const existing = list.find((x) => x.kind === "injected" && x.address.toLowerCase() === addrs[0].toLowerCase());
    if (existing) return persist(list, existing.id);
    const acc: StoredAccount = { id: crypto.randomUUID(), label, kind: "injected", address: addrs[0] };
    persist([...list, acc], acc.id);
  }, [list, persist]);

  const rename = useCallback(
    (id: string, label: string) => persist(list.map((x) => (x.id === id ? { ...x, label } : x)), activeId),
    [list, activeId, persist],
  );

  const remove = useCallback(
    (id: string) => {
      const next = list.filter((x) => x.id !== id);
      persist(next, activeId === id ? (next[0]?.id ?? null) : activeId);
    },
    [list, activeId, persist],
  );

  const activeStored = list.find((x) => x.id === activeId) ?? null;

  const signTypedData = useCallback(
    async (p: SignTypedDataParams): Promise<Hex> => {
      if (!activeStored) throw new AppError("NoWallet");
      if (activeStored.kind === "quick") {
        const account = privateKeyToAccount(activeStored.pk);
        return account.signTypedData(p as Parameters<typeof account.signTypedData>[0]);
      }
      const eth = injected();
      if (!eth) throw new AppError("NoInjected");
      await ensureChain(eth);
      const client = createWalletClient({ chain, transport: custom(eth) });
      return client.signTypedData({
        account: activeStored.address,
        ...(p as Omit<Parameters<typeof client.signTypedData>[0], "account">),
      });
    },
    [activeStored],
  );

  const signTypedDataAs = useCallback(async (id: string, p: SignTypedDataParams): Promise<Hex> => {
    const acc = listRef.current.find((x) => x.id === id);
    if (!acc || acc.kind !== "quick") throw new AppError("NoWallet");
    const account = privateKeyToAccount(acc.pk);
    return account.signTypedData(p as Parameters<typeof account.signTypedData>[0]);
  }, []);

  const value = useMemo<WalletCtx>(() => {
    const strip = (x: StoredAccount): WalletAccount => ({ id: x.id, label: x.label, kind: x.kind, address: x.address });
    return {
      ready,
      accounts: list.map(strip),
      active: activeStored ? strip(activeStored) : null,
      select,
      createQuick,
      connectInjected,
      rename,
      remove,
      signTypedData,
      signTypedDataAs,
      hasInjected,
      pinned,
    };
  }, [ready, list, activeStored, select, createQuick, connectInjected, rename, remove, signTypedData, signTypedDataAs, hasInjected, pinned]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
