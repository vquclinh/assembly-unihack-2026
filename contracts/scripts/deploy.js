// Deploys the whole Coc stack and writes the addresses to deployments/<network>.json
//   npx hardhat run scripts/deploy.js --network fuji
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { exportAbis, exportDeployment } = require("./export-web");

const PUBLIC_RPC = {
  fuji: "https://api.avax-test.network/ext/bc/C/rpc",
  localhost: "http://127.0.0.1:8545",
};
const EXPLORER = {
  fuji: "https://testnet.snowtrace.io",
  localhost: "",
};

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const responseWindow = Number(process.env.RESPONSE_WINDOW || 300);
  const mediationTimeout = Number(process.env.MEDIATION_TIMEOUT || 600);

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} AVAX\n`);

  let tokenAddress = process.env.USDC_ADDRESS;
  let mockToken = false;
  if (!tokenAddress) {
    const token = await (await ethers.getContractFactory("MockUSDC")).deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    mockToken = true;
    console.log(`MockUSDC (public faucet): ${tokenAddress}`);
  } else {
    console.log(`Using existing token:     ${tokenAddress}`);
  }

  const vault = await (await ethers.getContractFactory("DemoYieldVault")).deploy(tokenAddress);
  await vault.waitForDeployment();
  console.log(`DemoYieldVault:           ${await vault.getAddress()}`);

  const forwarder = await (await ethers.getContractFactory("CocForwarder")).deploy();
  await forwarder.waitForDeployment();
  console.log(`CocForwarder:             ${await forwarder.getAddress()}`);

  const escrowArgs = [tokenAddress, await vault.getAddress(), await forwarder.getAddress(), responseWindow, mediationTimeout];
  const escrow = await (await ethers.getContractFactory("CocEscrow")).deploy(...escrowArgs);
  await escrow.waitForDeployment();
  console.log(`CocEscrow:                ${await escrow.getAddress()}\n`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    token: tokenAddress,
    mockToken,
    vault: await vault.getAddress(),
    forwarder: await forwarder.getAddress(),
    escrow: await escrow.getAddress(),
    responseWindow,
    mediationTimeout,
    rpcUrl: PUBLIC_RPC[network.name] || "",
    explorer: EXPLORER[network.name] || "",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(`Saved deployments/${network.name}.json`);

  // Point the web app at this deployment (skipped for the throwaway in-process network).
  if (network.name !== "hardhat") {
    await exportAbis(hre);
    if (exportDeployment(out)) console.log("Updated web/src/lib/deployment.json and abis.json");
  }

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nVerify on Snowtrace with:");
    if (mockToken) console.log(`  npx hardhat verify --network ${network.name} ${tokenAddress}`);
    console.log(`  npx hardhat verify --network ${network.name} ${out.vault} ${tokenAddress}`);
    console.log(`  npx hardhat verify --network ${network.name} ${out.forwarder}`);
    console.log(`  npx hardhat verify --network ${network.name} ${out.escrow} ${escrowArgs.join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
