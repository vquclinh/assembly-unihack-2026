// Prints the address and Fuji AVAX balance of the wallet in PRIVATE_KEY. Never prints the key.
// Usage: npm run wallet
require("dotenv").config({ quiet: true });
const { Wallet, JsonRpcProvider, formatEther } = require("ethers");

(async () => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("PRIVATE_KEY is empty in contracts/.env");
    process.exit(1);
  }
  const wallet = new Wallet(pk);
  console.log(`Address: ${wallet.address}`);
  const url = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
  // staticNetwork: no endless retries when the RPC is unreachable.
  const provider = new JsonRpcProvider(url, 43113, { staticNetwork: true });
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
    const balance = await Promise.race([provider.getBalance(wallet.address), timeout]);
    console.log(`Balance: ${formatEther(balance)} AVAX (Fuji)`);
  } catch {
    console.log("Balance: could not reach the Fuji RPC");
  }
  provider.destroy();
  console.log(`Explorer: https://testnet.snowtrace.io/address/${wallet.address}`);
  console.log("Faucet:   https://core.app/tools/testnet-faucet/");
})();
