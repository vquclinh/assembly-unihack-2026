// Adds the CocBadge contract to an existing deployment without touching the escrow.
//   npx hardhat run scripts/deploy-badge.js --network fuji
// Reads deployments/<network>.json, deploys CocBadge, then saves the address there and in the web app.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { exportAbis, exportDeployment } = require("./export-web");

async function main() {
  const { ethers, network } = hre;
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployments/${network.name}.json. Run the main deploy first.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  const minCompleted = Number(process.env.BADGE_MIN_COMPLETED || 1);
  const minValueSeconds = process.env.BADGE_MIN_VALUE_SECONDS || "0";
  const args = [d.escrow, d.forwarder, minCompleted, minValueSeconds];
  const badge = await (await ethers.getContractFactory("CocBadge")).deploy(...args);
  await badge.waitForDeployment();
  d.badge = await badge.getAddress();
  d.badgeMinCompleted = minCompleted;
  console.log(`CocBadge: ${d.badge} (min completed leases: ${minCompleted})`);

  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
  console.log(`Updated deployments/${network.name}.json`);
  if (network.name !== "hardhat") {
    await exportAbis(hre);
    if (exportDeployment(d)) console.log("Updated web/src/lib/deployment.json and abis.json");
  }
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log(`\nVerify on Snowtrace with:\n  npx hardhat verify --network ${network.name} ${d.badge} ${args.join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
