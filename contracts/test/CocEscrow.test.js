const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const usdc = (n) => ethers.parseUnits(String(n), 6);
const hash = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

const RESPONSE = 3 * 24 * 3600;
const MEDIATION = 14 * 24 * 3600;
const HOLD = usdc(20);
const DEPOSIT = usdc(120);
const S = { None: 0, Offered: 1, Reserved: 2, Active: 3, ReleaseRequested: 4, SettlementProposed: 5, NoShowClaimed: 6, Disputed: 7, Closed: 8, Cancelled: 9 };

describe("CocEscrow", function () {
  let token, vault, forwarder, escrow;
  let deployer, landlord, tenant, mediator, stranger, relayer;
  let escrowAddr;

  beforeEach(async function () {
    [deployer, landlord, tenant, mediator, stranger, relayer] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("MockUSDC")).deploy();
    vault = await (await ethers.getContractFactory("DemoYieldVault")).deploy(await token.getAddress());
    forwarder = await (await ethers.getContractFactory("CocForwarder")).deploy();
    escrow = await (await ethers.getContractFactory("CocEscrow")).deploy(
      await token.getAddress(), await vault.getAddress(), await forwarder.getAddress(), RESPONSE, MEDIATION
    );
    escrowAddr = await escrow.getAddress();
    await token.mint(tenant.address, usdc(1000));
    await token.connect(tenant).approve(escrowAddr, ethers.MaxUint256);
  });

  async function offer(opts = {}) {
    const now = await time.latest();
    const args = {
      tenant: ethers.ZeroAddress, mediator: mediator.address, hold: HOLD, deposit: DEPOSIT,
      moveIn: now + 2 * 24 * 3600, end: now + 180 * 24 * 3600, yieldOptIn: false, terms: hash("terms"), ...opts,
    };
    await escrow.connect(landlord).createOffer(
      args.tenant, args.mediator, args.hold, args.deposit, args.moveIn, args.end, args.yieldOptIn, args.terms
    );
    return { id: await escrow.leaseCount(), ...args };
  }

  async function reserved(opts) {
    const o = await offer(opts);
    await escrow.connect(tenant).reserve(o.id);
    return o;
  }

  async function active(opts = {}, acceptYield = false) {
    const o = await reserved(opts);
    await escrow.connect(landlord).proposeCondition(o.id, hash("photos"));
    await escrow.connect(tenant).confirmMoveIn(o.id, hash("photos"), acceptYield);
    return o;
  }

  const bal = (who) => token.balanceOf(who.address ?? who);

  describe("offer", function () {
    it("creates an offer and indexes it", async function () {
      const { id } = await offer();
      const L = await escrow.getLease(id);
      expect(L.status).to.equal(S.Offered);
      expect(L.landlord).to.equal(landlord.address);
      expect(await escrow.leasesOfLandlord(landlord.address)).to.deep.equal([id]);
      expect(await escrow.leasesOfMediator(mediator.address)).to.deep.equal([id]);
    });

    it("rejects bad parameters", async function () {
      const now = await time.latest();
      const c = escrow.connect(landlord);
      const ok = [ethers.ZeroAddress, mediator.address, HOLD, DEPOSIT, now + 100, now + 200, false, hash("t")];
      const bad = (i, v) => ok.map((x, j) => (j === i ? v : x));
      await expect(c.createOffer(...bad(2, 0))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(3, HOLD - 1n))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(4, now - 1))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(5, now + 50))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(1, ethers.ZeroAddress))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(1, landlord.address))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(c.createOffer(...bad(0, landlord.address))).to.be.revertedWithCustomError(escrow, "BadParams");
    });

    it("landlord can cancel an unfunded offer, nobody else can", async function () {
      const { id } = await offer();
      await expect(escrow.connect(stranger).cancelOffer(id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await escrow.connect(landlord).cancelOffer(id);
      await expect(escrow.connect(tenant).reserve(id)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });

  describe("reservation (holding deposit)", function () {
    it("tenant reserves and the hold sits in the contract, not with the landlord", async function () {
      const { id } = await offer();
      await expect(escrow.connect(tenant).reserve(id)).to.changeTokenBalances(token, [tenant, escrow, landlord], [-HOLD, HOLD, 0]);
      const L = await escrow.getLease(id);
      expect(L.status).to.equal(S.Reserved);
      expect(L.tenant).to.equal(tenant.address);
    });

    it("landlord and mediator cannot reserve their own offer; locked offers only accept the named tenant", async function () {
      const a = await offer();
      await expect(escrow.connect(landlord).reserve(a.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await expect(escrow.connect(mediator).reserve(a.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      const b = await offer({ tenant: tenant.address });
      await token.mint(stranger.address, usdc(100));
      await token.connect(stranger).approve(escrowAddr, ethers.MaxUint256);
      await expect(escrow.connect(stranger).reserve(b.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await escrow.connect(tenant).reserve(b.id);
    });

    it("cannot reserve after the move-in deadline", async function () {
      const o = await offer();
      await time.increaseTo(o.moveIn + 1);
      await expect(escrow.connect(tenant).reserve(o.id)).to.be.revertedWithCustomError(escrow, "TooLate");
    });

    it("FAKE LANDLORD: a landlord alone can never take the holding deposit", async function () {
      const o = await reserved();
      // He cannot mark the room as handed over: only the tenant can confirm move-in.
      await escrow.connect(landlord).proposeCondition(o.id, hash("photos"));
      await expect(escrow.connect(landlord).confirmMoveIn(o.id, hash("photos"), false)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      // He cannot claim a no-show before the deadline.
      await expect(escrow.connect(landlord).claimNoShow(o.id)).to.be.revertedWithCustomError(escrow, "TooEarly");
      // After the deadline he claims a no-show, the tenant disputes, and he still has nothing.
      await time.increaseTo(o.moveIn + 1);
      await escrow.connect(landlord).claimNoShow(o.id);
      await escrow.connect(tenant).dispute(o.id, hash("chat screenshots"));
      expect(await bal(landlord)).to.equal(0);
      await expect(escrow.connect(landlord).resolve(o.id, 0, hash("x"))).to.be.revertedWithCustomError(escrow, "NotAllowed");
      // The mediator sends everything back to the tenant.
      await expect(escrow.connect(mediator).resolve(o.id, HOLD, hash("ruling"))).to.changeTokenBalances(token, [tenant, landlord, mediator], [HOLD, 0, 0]);
      expect((await escrow.landlordStats(landlord.address)).disputesLost).to.equal(1);
    });

    it("ghost landlord: tenant gets the hold back automatically after the deadline", async function () {
      const o = await reserved();
      await time.increaseTo(o.moveIn + RESPONSE - 10);
      await expect(escrow.connect(stranger).finalize(o.id)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increaseTo(o.moveIn + RESPONSE + 1);
      await expect(escrow.connect(stranger).finalize(o.id)).to.changeTokenBalances(token, [tenant, escrow], [HOLD, -HOLD]);
      expect((await escrow.getLease(o.id)).status).to.equal(S.Cancelled);
      expect((await escrow.landlordStats(landlord.address)).ghosted).to.equal(1);
    });

    it("real no-show: landlord receives the hold if the tenant stays silent", async function () {
      const o = await reserved();
      await time.increaseTo(o.moveIn + 1);
      await escrow.connect(landlord).claimNoShow(o.id);
      await expect(escrow.finalize(o.id)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increase(RESPONSE + 1);
      await expect(escrow.connect(tenant).dispute(o.id, hash("late"))).to.be.revertedWithCustomError(escrow, "TooLate");
      await expect(escrow.finalize(o.id)).to.changeTokenBalances(token, [landlord, tenant], [HOLD, 0]);
      expect((await escrow.tenantStats(tenant.address)).ghosted).to.equal(1);
      // A reservation that never became a lease does not count as a completed lease.
      expect((await escrow.landlordStats(landlord.address)).completed).to.equal(0);
    });

    it("tenant backing out forfeits the hold; landlord backing out refunds it", async function () {
      const a = await reserved();
      await expect(escrow.connect(stranger).cancelReservation(a.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await expect(escrow.connect(tenant).cancelReservation(a.id)).to.changeTokenBalances(token, [landlord, tenant], [HOLD, 0]);
      const b = await reserved();
      await expect(escrow.connect(tenant).refundReservation(b.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await expect(escrow.connect(landlord).refundReservation(b.id)).to.changeTokenBalances(token, [tenant, landlord], [HOLD, 0]);
    });
  });

  describe("move-in", function () {
    it("requires the tenant to confirm the exact condition report the landlord proposed", async function () {
      const o = await reserved();
      await expect(escrow.connect(tenant).confirmMoveIn(o.id, hash("photos"), false)).to.be.revertedWithCustomError(escrow, "ConditionMismatch");
      await expect(escrow.connect(stranger).proposeCondition(o.id, hash("photos"))).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await escrow.connect(landlord).proposeCondition(o.id, hash("photos"));
      await expect(escrow.connect(tenant).confirmMoveIn(o.id, hash("other photos"), false)).to.be.revertedWithCustomError(escrow, "ConditionMismatch");
      await expect(escrow.connect(tenant).confirmMoveIn(o.id, hash("photos"), false)).to.changeTokenBalances(token, [tenant, escrow], [-(DEPOSIT - HOLD), DEPOSIT - HOLD]);
      const L = await escrow.getLease(o.id);
      expect(L.status).to.equal(S.Active);
      expect(L.balance).to.equal(DEPOSIT);
      expect(L.yieldOn).to.equal(false);
    });

    it("works when the hold already equals the full deposit", async function () {
      const o = await active({ hold: DEPOSIT });
      expect((await escrow.getLease(o.id)).balance).to.equal(DEPOSIT);
    });
  });

  describe("move-out", function () {
    it("happy path: landlord returns everything in one click", async function () {
      const o = await active();
      await time.increase(30 * 24 * 3600);
      await expect(escrow.connect(landlord).proposeSettlement(o.id, 0, ethers.ZeroHash)).to.changeTokenBalances(token, [tenant, landlord, escrow], [DEPOSIT, 0, -DEPOSIT]);
      expect((await escrow.getLease(o.id)).status).to.equal(S.Closed);
      const ls = await escrow.landlordStats(landlord.address);
      expect(ls.completed).to.equal(1);
      expect(ls.amicable).to.equal(1);
      expect(ls.valueSeconds).to.be.gte(DEPOSIT * BigInt(30 * 24 * 3600));
      expect((await escrow.tenantStats(tenant.address)).amicable).to.equal(1);
    });

    it("silent landlord: tenant is refunded in full after the response window", async function () {
      const o = await active();
      await expect(escrow.connect(stranger).requestRelease(o.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await escrow.connect(tenant).requestRelease(o.id);
      await expect(escrow.finalize(o.id)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increase(RESPONSE + 1);
      await expect(escrow.connect(landlord).proposeSettlement(o.id, usdc(50), hash("late"))).to.be.revertedWithCustomError(escrow, "TooLate");
      await expect(escrow.finalize(o.id)).to.changeTokenBalances(token, [tenant, landlord], [DEPOSIT, 0]);
      expect((await escrow.landlordStats(landlord.address)).timeouts).to.equal(1);
    });

    it("tenant accepts a deduction", async function () {
      const o = await active();
      await escrow.connect(tenant).requestRelease(o.id);
      await escrow.connect(landlord).proposeSettlement(o.id, usdc(15), hash("broken lamp"));
      await expect(escrow.connect(landlord).acceptSettlement(o.id)).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await expect(escrow.connect(tenant).acceptSettlement(o.id)).to.changeTokenBalances(token, [tenant, landlord], [DEPOSIT - usdc(15), usdc(15)]);
    });

    it("silent tenant: the proposed deduction stands after the response window", async function () {
      const o = await active();
      await escrow.connect(landlord).proposeSettlement(o.id, usdc(15), hash("broken lamp"));
      await time.increase(RESPONSE + 1);
      await expect(escrow.finalize(o.id)).to.changeTokenBalances(token, [tenant, landlord], [DEPOSIT - usdc(15), usdc(15)]);
      expect((await escrow.tenantStats(tenant.address)).timeouts).to.equal(1);
    });

    it("landlord cannot propose more than the deposit", async function () {
      const o = await active();
      await expect(escrow.connect(landlord).proposeSettlement(o.id, DEPOSIT + 1n, hash("x"))).to.be.revertedWithCustomError(escrow, "BadParams");
    });
  });

  describe("dispute", function () {
    async function disputed() {
      const o = await active();
      await escrow.connect(landlord).proposeSettlement(o.id, usdc(40), hash("wall paint"));
      return o;
    }

    it("pays the undisputed part to the tenant immediately and freezes only the contested amount", async function () {
      const o = await disputed();
      await expect(escrow.connect(tenant).dispute(o.id, hash("move-in photos show the stain"))).to.changeTokenBalances(token, [tenant, escrow], [DEPOSIT - usdc(40), -(DEPOSIT - usdc(40))]);
      const L = await escrow.getLease(o.id);
      expect(L.status).to.equal(S.Disputed);
      expect(L.disputedAmount).to.equal(usdc(40));
      expect(L.balance).to.equal(usdc(40));
    });

    it("mediator can only split between the two parties and never receives anything", async function () {
      const o = await disputed();
      await escrow.connect(tenant).dispute(o.id, hash("evidence"));
      await expect(escrow.connect(stranger).resolve(o.id, usdc(10), hash("r"))).to.be.revertedWithCustomError(escrow, "NotAllowed");
      await expect(escrow.connect(mediator).resolve(o.id, usdc(41), hash("r"))).to.be.revertedWithCustomError(escrow, "BadParams");
      await expect(escrow.connect(mediator).resolve(o.id, usdc(30), hash("ruling"))).to.changeTokenBalances(token, [tenant, landlord, mediator, escrow], [usdc(30), usdc(10), 0, -usdc(40)]);
      const L = await escrow.getLease(o.id);
      expect(L.status).to.equal(S.Closed);
      expect(L.rulingHash).to.equal(hash("ruling"));
      const ls = await escrow.landlordStats(landlord.address);
      expect(ls.disputes).to.equal(1);
      expect(ls.disputesLost).to.equal(1);
      expect(ls.amicable).to.equal(0);
      expect((await escrow.tenantStats(tenant.address)).disputesLost).to.equal(0);
      expect(await escrow.mediatorResolved(mediator.address)).to.equal(1);
    });

    it("silent mediator: the contested amount is split 50/50 after the mediation timeout", async function () {
      const o = await disputed();
      await escrow.connect(tenant).dispute(o.id, hash("evidence"));
      await time.increase(MEDIATION - 10);
      await expect(escrow.finalize(o.id)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increase(12);
      await expect(escrow.finalize(o.id)).to.changeTokenBalances(token, [tenant, landlord], [usdc(20), usdc(20)]);
      expect(await escrow.mediatorTimedOut(mediator.address)).to.equal(1);
    });

    it("cannot be disputed twice or resolved twice", async function () {
      const o = await disputed();
      await escrow.connect(tenant).dispute(o.id, hash("e"));
      await expect(escrow.connect(tenant).dispute(o.id, hash("e"))).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await escrow.connect(mediator).resolve(o.id, usdc(40), hash("r"));
      await expect(escrow.connect(mediator).resolve(o.id, 0, hash("r"))).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.finalize(o.id)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });

  describe("optional yield", function () {
    it("is only on when both sides opt in", async function () {
      const a = await active({ yieldOptIn: true }, false);
      expect((await escrow.getLease(a.id)).yieldOn).to.equal(false);
      const b = await active({ yieldOptIn: false }, true);
      expect((await escrow.getLease(b.id)).yieldOn).to.equal(false);
      const c = await active({ yieldOptIn: true }, true);
      expect((await escrow.getLease(c.id)).yieldOn).to.equal(true);
      expect(await token.balanceOf(await vault.getAddress())).to.equal(DEPOSIT);
    });

    it("returns the principal and splits the yield 50/50", async function () {
      const o = await active({ yieldOptIn: true }, true);
      await token.mint(await vault.getAddress(), usdc(6)); // simulated interest
      const value = await escrow.currentValue(o.id);
      expect(value).to.be.closeTo(DEPOSIT + usdc(6), 2n);
      const t0 = await bal(tenant), l0 = await bal(landlord);
      await escrow.connect(landlord).proposeSettlement(o.id, 0, ethers.ZeroHash);
      const tGain = (await bal(tenant)) - t0, lGain = (await bal(landlord)) - l0;
      expect(tGain).to.be.closeTo(DEPOSIT + usdc(3), 2n);
      expect(lGain).to.be.closeTo(usdc(3), 2n);
      expect(tGain + lGain).to.equal(value);
      expect(await token.balanceOf(escrowAddr)).to.equal(0);
    });

    it("handles a vault loss without getting stuck: payouts shrink to what is left", async function () {
      const o = await active({ yieldOptIn: true }, true);
      // Simulate a 25% loss by burning vault assets through a blocked transfer trick: move them out.
      const vaultAddr = await vault.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr]);
      await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"]);
      const vaultSigner = await ethers.getSigner(vaultAddr);
      await token.connect(vaultSigner).transfer(stranger.address, usdc(30));
      await escrow.connect(landlord).proposeSettlement(o.id, usdc(100), hash("claims a lot"));
      const t0 = await bal(tenant), l0 = await bal(landlord);
      await escrow.connect(tenant).acceptSettlement(o.id);
      const left = usdc(90);
      expect((await bal(landlord)) - l0 + ((await bal(tenant)) - t0)).to.be.closeTo(left, 2n);
      expect((await bal(landlord)) - l0).to.be.lte(left);
      expect((await escrow.getLease(o.id)).status).to.equal(S.Closed);
    });
  });

  describe("safety", function () {
    it("a blocked recipient cannot freeze the lease: funds become withdrawable credit", async function () {
      const o = await active();
      await escrow.connect(landlord).proposeSettlement(o.id, usdc(20), hash("x"));
      await token.setBlocked(landlord.address, true);
      await escrow.connect(tenant).acceptSettlement(o.id);
      expect((await escrow.getLease(o.id)).status).to.equal(S.Closed);
      expect(await escrow.credit(landlord.address)).to.equal(usdc(20));
      await token.setBlocked(landlord.address, false);
      await expect(escrow.connect(landlord).withdrawCredit()).to.changeTokenBalances(token, [landlord], [usdc(20)]);
      expect(await escrow.credit(landlord.address)).to.equal(0);
    });

    it("keeps leases isolated: closing one never touches another's money", async function () {
      const a = await active();
      const b = await active();
      await escrow.connect(landlord).proposeSettlement(a.id, 0, ethers.ZeroHash);
      expect(await token.balanceOf(escrowAddr)).to.equal(DEPOSIT);
      expect((await escrow.getLease(b.id)).balance).to.equal(DEPOSIT);
    });
  });

  describe("gasless", function () {
    async function signAuth(signer, value) {
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const validBefore = (await time.latest()) + 3600;
      const domain = { name: "USD Coin (test)", version: "2", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
      const types = { ReceiveWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ] };
      const sig = ethers.Signature.from(await signer.signTypedData(domain, types, { from: signer.address, to: escrowAddr, value, validAfter: 0, validBefore, nonce }));
      return { validAfter: 0, validBefore, nonce, v: sig.v, r: sig.r, s: sig.s };
    }

    async function relay(signer, data) {
      const domain = { name: "CocForwarder", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await forwarder.getAddress() };
      const types = { ForwardRequest: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" },
      ] };
      const req = { from: signer.address, to: escrowAddr, value: 0n, gas: 1_000_000n, nonce: await forwarder.nonces(signer.address), deadline: (await time.latest()) + 3600, data };
      const signature = await signer.signTypedData(domain, types, req);
      return forwarder.connect(relayer).execute({ ...req, signature });
    }

    it("tenant with zero AVAX and no approval completes reserve and move-in through the relayer", async function () {
      const poor = ethers.Wallet.createRandom().connect(ethers.provider);
      await token.mint(poor.address, DEPOSIT);
      expect(await ethers.provider.getBalance(poor.address)).to.equal(0);
      const { id } = await offer();

      await relay(poor, escrow.interface.encodeFunctionData("reserveWithAuthorization", [id, await signAuth(poor, HOLD)]));
      let L = await escrow.getLease(id);
      expect(L.tenant).to.equal(poor.address);
      expect(L.status).to.equal(S.Reserved);

      await escrow.connect(landlord).proposeCondition(id, hash("photos"));
      await relay(poor, escrow.interface.encodeFunctionData("confirmMoveInWithAuthorization", [id, hash("photos"), false, await signAuth(poor, DEPOSIT - HOLD)]));
      L = await escrow.getLease(id);
      expect(L.status).to.equal(S.Active);
      expect(await token.balanceOf(poor.address)).to.equal(0);
      expect(await ethers.provider.getBalance(poor.address)).to.equal(0);
    });

    it("an authorization for the wrong amount is rejected", async function () {
      const { id } = await offer();
      const auth = await signAuth(tenant, HOLD - 1n);
      await expect(escrow.connect(tenant).reserveWithAuthorization(id, auth)).to.be.reverted;
    });

    it("a relayer cannot impersonate a user without their signature", async function () {
      const { id } = await offer();
      const data = escrow.interface.encodeFunctionData("cancelOffer", [id]);
      // Signed by the stranger but claiming to be the landlord.
      const domain = { name: "CocForwarder", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await forwarder.getAddress() };
      const types = { ForwardRequest: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" },
      ] };
      const req = { from: landlord.address, to: escrowAddr, value: 0n, gas: 1_000_000n, nonce: await forwarder.nonces(landlord.address), deadline: (await time.latest()) + 3600, data };
      const signature = await stranger.signTypedData(domain, types, req);
      await expect(forwarder.connect(relayer).execute({ ...req, signature })).to.be.reverted;
      expect((await escrow.getLease(id)).status).to.equal(S.Offered);
    });
  });
});
