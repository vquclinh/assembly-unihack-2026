const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const usdc = (n) => ethers.parseUnits(String(n), 6);
const hash = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const RESPONSE = 3 * 24 * 3600;
const MEDIATION = 14 * 24 * 3600;

describe("CocBadge", function () {
  let token, escrow, forwarder, badge;
  let landlord, tenant, mediator, stranger;

  beforeEach(async function () {
    [, landlord, tenant, mediator, stranger] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const vault = await (await ethers.getContractFactory("DemoYieldVault")).deploy(await token.getAddress());
    forwarder = await (await ethers.getContractFactory("CocForwarder")).deploy();
    escrow = await (await ethers.getContractFactory("CocEscrow")).deploy(
      await token.getAddress(), await vault.getAddress(), await forwarder.getAddress(), RESPONSE, MEDIATION
    );
    badge = await (await ethers.getContractFactory("CocBadge")).deploy(await escrow.getAddress(), await forwarder.getAddress(), 2, 0);
    await token.mint(tenant.address, usdc(5000));
    await token.connect(tenant).approve(await escrow.getAddress(), ethers.MaxUint256);
  });

  // Runs one lease from offer to an amicable full refund.
  async function cleanLease() {
    const now = await time.latest();
    await escrow.connect(landlord).createOffer(ethers.ZeroAddress, mediator.address, usdc(20), usdc(100), now + 86400, now + 30 * 86400, false, hash("t"));
    const id = await escrow.leaseCount();
    await escrow.connect(tenant).reserve(id);
    await escrow.connect(landlord).proposeCondition(id, hash("p"));
    await escrow.connect(tenant).confirmMoveIn(id, hash("p"), false);
    await time.increase(7 * 86400);
    await escrow.connect(landlord).proposeSettlement(id, 0, ethers.ZeroHash);
  }

  it("rejects a landlord without enough completed leases", async function () {
    await cleanLease();
    expect(await badge.eligible(landlord.address)).to.equal(false);
    await expect(badge.connect(landlord).claim()).to.be.revertedWithCustomError(badge, "NotEligible");
  });

  it("issues one soulbound badge with on-chain metadata", async function () {
    await cleanLease();
    await cleanLease();
    await expect(badge.connect(landlord).claim()).to.emit(badge, "Locked").withArgs(1);
    expect(await badge.ownerOf(1)).to.equal(landlord.address);
    expect(await badge.isTrusted(landlord.address)).to.equal(true);
    expect(await badge.locked(1)).to.equal(true);
    expect(await badge.supportsInterface("0xb45a3c0e")).to.equal(true);
    await expect(badge.connect(landlord).claim()).to.be.revertedWithCustomError(badge, "AlreadyHolder");

    const uri = await badge.tokenURI(1);
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
    expect(json.name).to.equal("Coc Trusted Landlord #1");
    expect(json.attributes[0]).to.deep.equal({ trait_type: "Completed leases", value: 2 });
    expect(json.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
  });

  it("cannot be transferred or approved", async function () {
    await cleanLease();
    await cleanLease();
    await badge.connect(landlord).claim();
    await expect(badge.connect(landlord).transferFrom(landlord.address, stranger.address, 1)).to.be.revertedWithCustomError(badge, "Soulbound");
    await expect(badge.connect(landlord).approve(stranger.address, 1)).to.be.revertedWithCustomError(badge, "Soulbound");
    await expect(badge.connect(landlord).setApprovalForAll(stranger.address, true)).to.be.revertedWithCustomError(badge, "Soulbound");
  });

  it("anyone can revoke the badge once the landlord ghosts a tenant", async function () {
    await cleanLease();
    await cleanLease();
    await badge.connect(landlord).claim();
    await expect(badge.connect(stranger).revoke(landlord.address)).to.be.revertedWithCustomError(badge, "StillEligible");

    // The landlord takes a reservation and never hands the room over.
    const now = await time.latest();
    await escrow.connect(landlord).createOffer(ethers.ZeroAddress, mediator.address, usdc(20), usdc(100), now + 86400, now + 30 * 86400, false, hash("t"));
    const id = await escrow.leaseCount();
    await escrow.connect(tenant).reserve(id);
    await time.increase(86400 + RESPONSE + 1);
    await escrow.connect(stranger).finalize(id);

    expect(await badge.isTrusted(landlord.address)).to.equal(false);
    await expect(badge.connect(stranger).revoke(landlord.address)).to.emit(badge, "Revoked").withArgs(landlord.address, 1, stranger.address);
    expect(await badge.badgeOf(landlord.address)).to.equal(0);
    await expect(badge.ownerOf(1)).to.be.revertedWithCustomError(badge, "ERC721NonexistentToken");
  });

  it("can be claimed gaslessly through the forwarder", async function () {
    await cleanLease();
    await cleanLease();
    const data = badge.interface.encodeFunctionData("claim");
    const { chainId } = await ethers.provider.getNetwork();
    const req = {
      from: landlord.address, to: await badge.getAddress(), value: 0n, gas: 600000n,
      nonce: await forwarder.nonces(landlord.address), deadline: (await time.latest()) + 3600, data,
    };
    const signature = await landlord.signTypedData(
      { name: "CocForwarder", version: "1", chainId, verifyingContract: await forwarder.getAddress() },
      { ForwardRequest: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" },
      ] },
      req
    );
    await forwarder.connect(stranger).execute({ ...req, signature });
    expect(await badge.ownerOf(1)).to.equal(landlord.address);
  });
});
