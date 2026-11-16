// Copies contract ABIs (and optionally a deployment) into the web app.
const fs = require("fs");
const path = require("path");

const WEB_LIB = path.join(__dirname, "..", "..", "web", "src", "lib");

async function exportAbis(hre) {
  if (!fs.existsSync(WEB_LIB)) return false;
  const names = ["CocEscrow", "CocForwarder", "MockUSDC", "DemoYieldVault", "CocBadge"];
  const out = {};
  for (const n of names) out[n] = (await hre.artifacts.readArtifact(n)).abi;
  fs.writeFileSync(path.join(WEB_LIB, "abis.json"), JSON.stringify(out, null, 2) + "\n");
  return true;
}

function exportDeployment(deployment) {
  if (!fs.existsSync(WEB_LIB)) return false;
  fs.writeFileSync(path.join(WEB_LIB, "deployment.json"), JSON.stringify(deployment, null, 2) + "\n");
  return true;
}

module.exports = { exportAbis, exportDeployment };

// `npx hardhat run scripts/export-web.js` refreshes the ABIs only.
if (require.main === module) {
  const hre = require("hardhat");
  exportAbis(hre).then((ok) => console.log(ok ? "ABIs written to web/src/lib/abis.json" : "web/ not found"));
}
