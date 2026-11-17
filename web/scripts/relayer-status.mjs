// Shows the relayer wallet's state and, with --fix, clears transactions stuck in the mempool.
// Usage (in web/):  npm run relayer          check only
//                   npm run relayer -- --fix  replace stuck transactions with empty ones
// Reads RELAYER_PRIVATE_KEY and RPC_URL from web/.env.local, or PRIVATE_KEY from contracts/.env.
// Never prints the key.
import { readFileSync } from "fs";
import { createPublicClient, createWalletClient, formatEther, formatGwei, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

function envFrom(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}

const web = envFrom(".env.local");
const contracts = envFrom("../contracts/.env");
let pk = (process.env.RELAYER_PRIVATE_KEY || web.RELAYER_PRIVATE_KEY || contracts.PRIVATE_KEY || "").trim();
if (!pk) {
  console.log("No RELAYER_PRIVATE_KEY in web/.env.local and no PRIVATE_KEY in contracts/.env.");
  process.exit(1);
}
if (!pk.startsWith("0x")) pk = `0x${pk}`;
const account = privateKeyToAccount(pk);
const transport = http(process.env.RPC_URL || web.RPC_URL || undefined, { timeout: 15_000 });
const pub = createPublicClient({ chain: avalancheFuji, transport });

const t0 = Date.now();
const [balance, latest, pending, gasPrice] = await Promise.all([
  pub.getBalance({ address: account.address }),
  pub.getTransactionCount({ address: account.address, blockTag: "latest" }),
  pub.getTransactionCount({ address: account.address, blockTag: "pending" }),
  pub.getGasPrice(),
]);
console.log(`Relayer:   ${account.address}`);
console.log(`Balance:   ${formatEther(balance)} AVAX`);
console.log(`Gas price: ${formatGwei(gasPrice)} gwei`);
console.log(`Nonce:     ${latest} confirmed, ${pending} including pending`);
console.log(`RPC:       ${Date.now() - t0} ms for 4 reads (${process.env.RPC_URL || web.RPC_URL ? "RPC_URL" : "public Fuji RPC"})`);
console.log(`Explorer:  https://testnet.snowtrace.io/address/${account.address}`);

const waiting = pending - latest;
if (waiting > 0) console.log(`\n${waiting} transaction(s) are waiting in the mempool.`);
else console.log("\nNo transaction is waiting in the mempool.");

if (!process.argv.includes("--fix")) {
  if (waiting > 0) console.log('If this stays above 0 for more than a minute, run: npm run relayer -- --fix');
  else console.log("Nothing is stuck. If steps are still slow, the RPC above may be busy: try again in a few minutes or set RPC_URL in web/.env.local.");
  process.exit(0);
}

// Replace each waiting nonce (or fill the next one, in case a later transaction waits behind a gap)
// with an empty transfer to itself at a much higher fee. Costs a few thousandths of an AVAX at most.
const wallet = createWalletClient({ account, chain: avalancheFuji, transport });
const fee = gasPrice * 3n > 30_000_000_000n ? gasPrice * 3n : 30_000_000_000n;
const nonces = waiting > 0 ? Array.from({ length: waiting }, (_, i) => latest + i) : [latest];
for (const nonce of nonces) {
  try {
    const hash = await wallet.sendTransaction({ to: account.address, value: 0n, nonce, gas: 21_000n, maxFeePerGas: fee, maxPriorityFeePerGas: fee });
    await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    console.log(`Nonce ${nonce}: cleared (${hash})`);
  } catch (e) {
    console.log(`Nonce ${nonce}: ${String(e.shortMessage || e.message).split("\n")[0]}`);
  }
}
const after = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
const done = await pub.getTransactionCount({ address: account.address, blockTag: "latest" });
console.log(`\nNonce now: ${done} confirmed, ${after} including pending. Restart npm run dev and try the demo again.`);
