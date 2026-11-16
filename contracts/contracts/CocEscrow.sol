// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev EIP-3009 as implemented by USDC. `receiveWithAuthorization` can only be
///      called by the payee, so a signed authorization cannot be front-run.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title CocEscrow - neutral rental deposit escrow ("Cọc")
/// @notice The deposit sits in this contract instead of the landlord's pocket.
///         Nobody, including the mediator and the team that deployed this
///         contract, can move it anywhere except to the tenant or the landlord.
///
///         Life of a lease:
///           Offered -> Reserved -> Active -> (ReleaseRequested | SettlementProposed) -> Closed
///         with NoShowClaimed / Disputed as side branches. Every waiting state has a
///         deadline after which anyone can call `finalize`, so money never gets stuck.
contract CocEscrow is ERC2771Context, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    enum Status {
        None,
        Offered, // landlord created the deposit link
        Reserved, // tenant paid the holding deposit
        Active, // tenant confirmed move-in and paid the full deposit
        ReleaseRequested, // tenant moved out and asked for the deposit back
        SettlementProposed, // landlord proposed a deduction
        NoShowClaimed, // landlord says the tenant never showed up
        Disputed, // waiting for the mediator
        Closed,
        Cancelled
    }

    struct Lease {
        address landlord;
        address tenant; // address(0) while Offered = anyone holding the link may reserve
        address mediator;
        uint256 holdAmount; // holding deposit paid at reservation
        uint256 depositAmount; // full deposit, holdAmount included
        uint256 balance; // principal currently held for this lease
        uint256 proposedDeduction;
        uint256 disputedAmount;
        uint256 shares; // vault shares while yield is on
        uint64 moveInDeadline;
        uint64 leaseEnd;
        uint64 activatedAt;
        uint64 actionAt; // start of the current waiting window
        Status status;
        bool landlordYieldOptIn;
        bool yieldOn;
        bytes32 termsHash; // hash of the off-chain lease terms
        bytes32 conditionHash; // hash of the move-in photo report, signed off by both sides
        bytes32 landlordEvidence;
        bytes32 tenantEvidence;
        bytes32 rulingHash;
    }

    /// @notice Objective track record. No free-text reviews, only facts the contract observed.
    struct Stats {
        uint32 completed; // leases that reached Active and then closed
        uint32 amicable; // closed by mutual agreement
        uint32 disputes; // went to mediation
        uint32 disputesLost; // mediator gave the other side more than half
        uint32 timeouts; // stayed silent until the other side had to finalize
        uint32 ghosted; // landlord: reservation expired with no handover. tenant: no-show
        uint256 valueSeconds; // sum(deposit * seconds held): makes fake leases expensive to farm
    }

    struct Auth {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ---------------------------------------------------------------- storage

    uint256 public constant YIELD_TENANT_BPS = 5_000; // yield is split 50/50
    uint256 private constant BPS = 10_000;

    IERC20 public immutable token;
    IERC4626 public immutable vault; // address(0) = yield disabled on this deployment
    uint256 public immutable responseWindow;
    uint256 public immutable mediationTimeout;

    uint256 public leaseCount;
    mapping(uint256 => Lease) private _leases;
    mapping(address => Stats) public landlordStats;
    mapping(address => Stats) public tenantStats;
    mapping(address => uint32) public mediatorResolved;
    mapping(address => uint32) public mediatorTimedOut;
    mapping(address => uint256[]) private _landlordLeases;
    mapping(address => uint256[]) private _tenantLeases;
    mapping(address => uint256[]) private _mediatorLeases;
    /// @notice Funds whose push-transfer failed (for example a blocked address). Pull with `withdrawCredit`.
    mapping(address => uint256) public credit;

    // ----------------------------------------------------------------- events

    event OfferCreated(
        uint256 indexed id,
        address indexed landlord,
        address indexed tenant,
        address mediator,
        uint256 holdAmount,
        uint256 depositAmount,
        uint64 moveInDeadline,
        uint64 leaseEnd,
        bool yieldOptIn,
        bytes32 termsHash
    );
    event OfferCancelled(uint256 indexed id);
    event Reserved(uint256 indexed id, address indexed tenant, uint256 amount);
    event ConditionProposed(uint256 indexed id, bytes32 conditionHash);
    event MovedIn(uint256 indexed id, bytes32 conditionHash, uint256 deposit, bool yieldOn);
    event ReservationCancelled(uint256 indexed id, address indexed by, uint256 toLandlord, uint256 toTenant);
    event NoShowClaimed(uint256 indexed id);
    event ReleaseRequested(uint256 indexed id);
    event SettlementProposed(uint256 indexed id, uint256 deduction, bytes32 evidence);
    event Disputed(uint256 indexed id, uint256 disputedAmount, bytes32 tenantEvidence);
    event Resolved(uint256 indexed id, address indexed mediator, uint256 toTenant, uint256 toLandlord, bytes32 rulingHash);
    event YieldPaid(uint256 indexed id, uint256 toTenant, uint256 toLandlord);
    event Closed(uint256 indexed id, uint256 toTenant, uint256 toLandlord, string reason);
    event Paid(uint256 indexed id, address indexed to, uint256 amount);
    event Credited(address indexed to, uint256 amount);

    // ----------------------------------------------------------------- errors

    error BadParams();
    error NotAllowed();
    error WrongStatus();
    error TooEarly();
    error TooLate();
    error ConditionMismatch();

    // ------------------------------------------------------------ constructor

    /// @param token_ deposit token (USDC). The contract is token-agnostic by design.
    /// @param vault_ ERC-4626 vault for optional yield, or address(0)
    /// @param forwarder_ ERC-2771 forwarder so users never need AVAX for gas
    constructor(
        IERC20 token_,
        IERC4626 vault_,
        address forwarder_,
        uint256 responseWindow_,
        uint256 mediationTimeout_
    ) ERC2771Context(forwarder_) {
        if (address(token_) == address(0) || responseWindow_ == 0 || mediationTimeout_ == 0) revert BadParams();
        if (address(vault_) != address(0) && vault_.asset() != address(token_)) revert BadParams();
        token = token_;
        vault = vault_;
        responseWindow = responseWindow_;
        mediationTimeout = mediationTimeout_;
    }

    // ------------------------------------------------------------------ views

    function getLease(uint256 id) external view returns (Lease memory) {
        return _leases[id];
    }

    function leasesOfLandlord(address a) external view returns (uint256[] memory) {
        return _landlordLeases[a];
    }

    function leasesOfTenant(address a) external view returns (uint256[] memory) {
        return _tenantLeases[a];
    }

    function leasesOfMediator(address a) external view returns (uint256[] memory) {
        return _mediatorLeases[a];
    }

    /// @notice Current value of a lease including unrealised yield.
    function currentValue(uint256 id) external view returns (uint256) {
        Lease storage L = _leases[id];
        if (L.yieldOn) return vault.previewRedeem(L.shares);
        return L.balance;
    }

    // --------------------------------------------------------------- landlord

    /// @notice Step 1. Landlord creates a deposit link to send over Zalo/Messenger.
    /// @param tenant optional: lock the link to one wallet. address(0) = whoever opens the link.
    function createOffer(
        address tenant,
        address mediator,
        uint256 holdAmount,
        uint256 depositAmount,
        uint64 moveInDeadline,
        uint64 leaseEnd,
        bool yieldOptIn,
        bytes32 termsHash
    ) external returns (uint256 id) {
        address landlord = _msgSender();
        if (
            holdAmount == 0 ||
            depositAmount < holdAmount ||
            moveInDeadline <= block.timestamp ||
            leaseEnd <= moveInDeadline ||
            mediator == address(0) ||
            mediator == landlord ||
            mediator == tenant ||
            tenant == landlord
        ) revert BadParams();

        id = ++leaseCount;
        Lease storage L = _leases[id];
        L.landlord = landlord;
        L.tenant = tenant;
        L.mediator = mediator;
        L.holdAmount = holdAmount;
        L.depositAmount = depositAmount;
        L.moveInDeadline = moveInDeadline;
        L.leaseEnd = leaseEnd;
        L.landlordYieldOptIn = yieldOptIn;
        L.termsHash = termsHash;
        L.status = Status.Offered;

        _landlordLeases[landlord].push(id);
        _mediatorLeases[mediator].push(id);
        emit OfferCreated(
            id, landlord, tenant, mediator, holdAmount, depositAmount, moveInDeadline, leaseEnd, yieldOptIn, termsHash
        );
    }

    function cancelOffer(uint256 id) external {
        Lease storage L = _leases[id];
        if (L.status != Status.Offered) revert WrongStatus();
        if (_msgSender() != L.landlord) revert NotAllowed();
        L.status = Status.Cancelled;
        emit OfferCancelled(id);
    }

    /// @notice Landlord uploads the move-in photo report. The tenant must confirm the same hash.
    function proposeCondition(uint256 id, bytes32 conditionHash) external {
        Lease storage L = _leases[id];
        if (L.status != Status.Reserved) revert WrongStatus();
        if (_msgSender() != L.landlord) revert NotAllowed();
        if (conditionHash == bytes32(0)) revert BadParams();
        L.conditionHash = conditionHash;
        emit ConditionProposed(id, conditionHash);
    }

    /// @notice Landlord gives the holding deposit back (deal called off by the landlord).
    function refundReservation(uint256 id) external nonReentrant {
        Lease storage L = _leases[id];
        if (L.status != Status.Reserved && L.status != Status.NoShowClaimed) revert WrongStatus();
        if (_msgSender() != L.landlord) revert NotAllowed();
        uint256 amount = L.balance;
        L.balance = 0;
        L.status = Status.Cancelled;
        _pay(id, L.tenant, amount);
        emit ReservationCancelled(id, L.landlord, 0, amount);
    }

    /// @notice After the move-in deadline: landlord says the tenant never showed up.
    ///         The tenant gets `responseWindow` to dispute, otherwise the holding deposit goes to the landlord.
    function claimNoShow(uint256 id) external {
        Lease storage L = _leases[id];
        if (L.status != Status.Reserved) revert WrongStatus();
        if (_msgSender() != L.landlord) revert NotAllowed();
        if (block.timestamp <= L.moveInDeadline) revert TooEarly();
        L.status = Status.NoShowClaimed;
        L.actionAt = uint64(block.timestamp);
        emit NoShowClaimed(id);
    }

    /// @notice Move-out. `deduction == 0` returns the whole deposit to the tenant in one click.
    ///         Otherwise the tenant gets `responseWindow` to accept or dispute.
    function proposeSettlement(uint256 id, uint256 deduction, bytes32 evidence) external nonReentrant {
        Lease storage L = _leases[id];
        if (_msgSender() != L.landlord) revert NotAllowed();
        if (L.status == Status.ReleaseRequested) {
            if (block.timestamp > L.actionAt + responseWindow) revert TooLate();
        } else if (L.status != Status.Active) {
            revert WrongStatus();
        }
        if (deduction > L.depositAmount) revert BadParams();

        if (deduction == 0) {
            _exitVault(id, L);
            landlordStats[L.landlord].amicable++;
            tenantStats[L.tenant].amicable++;
            _close(id, L, L.balance, 0, "returned in full");
            return;
        }
        L.proposedDeduction = deduction;
        L.landlordEvidence = evidence;
        L.status = Status.SettlementProposed;
        L.actionAt = uint64(block.timestamp);
        emit SettlementProposed(id, deduction, evidence);
    }

    // ----------------------------------------------------------------- tenant

    /// @notice Step 2. Tenant pays the holding deposit (needs a prior ERC-20 approval).
    function reserve(uint256 id) external nonReentrant {
        Lease storage L = _reserveChecks(id);
        token.safeTransferFrom(L.tenant, address(this), L.holdAmount);
        _afterReserve(id, L);
    }

    /// @notice Same as `reserve` but paid with a signed USDC authorization: no approval, no gas.
    function reserveWithAuthorization(uint256 id, Auth calldata a) external nonReentrant {
        Lease storage L = _reserveChecks(id);
        _pullWithAuth(L.tenant, L.holdAmount, a);
        _afterReserve(id, L);
    }

    /// @notice Step 3. Tenant confirms they received the room in the photographed condition and
    ///         tops the holding deposit up to the full deposit. Only the tenant can do this:
    ///         a fake landlord can never mark a room as handed over.
    function confirmMoveIn(uint256 id, bytes32 conditionHash, bool acceptYield) external nonReentrant {
        (Lease storage L, uint256 topUp) = _moveInChecks(id, conditionHash);
        if (topUp > 0) token.safeTransferFrom(L.tenant, address(this), topUp);
        _afterMoveIn(id, L, acceptYield);
    }

    function confirmMoveInWithAuthorization(uint256 id, bytes32 conditionHash, bool acceptYield, Auth calldata a)
        external
        nonReentrant
    {
        (Lease storage L, uint256 topUp) = _moveInChecks(id, conditionHash);
        if (topUp > 0) _pullWithAuth(L.tenant, topUp, a);
        _afterMoveIn(id, L, acceptYield);
    }

    /// @notice Tenant walks away before moving in. The holding deposit goes to the landlord
    ///         (same rule as Article 328 of the Civil Code: the side that backs out loses the deposit).
    function cancelReservation(uint256 id) external nonReentrant {
        Lease storage L = _leases[id];
        if (L.status != Status.Reserved) revert WrongStatus();
        if (_msgSender() != L.tenant) revert NotAllowed();
        uint256 amount = L.balance;
        L.balance = 0;
        L.status = Status.Cancelled;
        tenantStats[L.tenant].ghosted++;
        _pay(id, L.landlord, amount);
        emit ReservationCancelled(id, L.tenant, amount, 0);
    }

    /// @notice Tenant moved out and asks for the deposit. The landlord gets `responseWindow`
    ///         to answer with `proposeSettlement`; silence means a full refund.
    function requestRelease(uint256 id) external {
        Lease storage L = _leases[id];
        if (L.status != Status.Active) revert WrongStatus();
        if (_msgSender() != L.tenant) revert NotAllowed();
        L.status = Status.ReleaseRequested;
        L.actionAt = uint64(block.timestamp);
        emit ReleaseRequested(id);
    }

    function acceptSettlement(uint256 id) external nonReentrant {
        Lease storage L = _leases[id];
        if (L.status != Status.SettlementProposed) revert WrongStatus();
        if (_msgSender() != L.tenant) revert NotAllowed();
        landlordStats[L.landlord].amicable++;
        tenantStats[L.tenant].amicable++;
        _settleAsProposed(id, L, "settlement accepted");
    }

    /// @notice Tenant rejects a no-show claim or a proposed deduction. The undisputed part of the
    ///         deposit is paid to the tenant immediately; only the contested amount waits for the mediator.
    function dispute(uint256 id, bytes32 evidence) external nonReentrant {
        Lease storage L = _leases[id];
        if (_msgSender() != L.tenant) revert NotAllowed();
        if (L.status != Status.SettlementProposed && L.status != Status.NoShowClaimed) revert WrongStatus();
        if (block.timestamp > L.actionAt + responseWindow) revert TooLate();

        uint256 contested;
        if (L.status == Status.SettlementProposed) {
            _exitVault(id, L);
            contested = L.proposedDeduction > L.balance ? L.balance : L.proposedDeduction;
            uint256 undisputed = L.balance - contested;
            L.balance = contested;
            if (undisputed > 0) _pay(id, L.tenant, undisputed);
        } else {
            contested = L.balance;
        }
        L.disputedAmount = contested;
        L.tenantEvidence = evidence;
        L.status = Status.Disputed;
        L.actionAt = uint64(block.timestamp);
        landlordStats[L.landlord].disputes++;
        tenantStats[L.tenant].disputes++;
        emit Disputed(id, contested, evidence);
    }

    // --------------------------------------------------------------- mediator

    /// @notice The mediator can only split the contested amount between the two parties.
    ///         There is no code path that sends money to the mediator.
    function resolve(uint256 id, uint256 toTenant, bytes32 rulingHash) external nonReentrant {
        Lease storage L = _leases[id];
        if (L.status != Status.Disputed) revert WrongStatus();
        if (_msgSender() != L.mediator) revert NotAllowed();
        uint256 contested = L.balance;
        if (toTenant > contested) revert BadParams();
        uint256 toLandlord = contested - toTenant;
        if (toTenant > toLandlord) landlordStats[L.landlord].disputesLost++;
        else if (toLandlord > toTenant) tenantStats[L.tenant].disputesLost++;
        mediatorResolved[L.mediator]++;
        L.rulingHash = rulingHash;
        emit Resolved(id, L.mediator, toTenant, toLandlord, rulingHash);
        _close(id, L, toTenant, toLandlord, "mediated");
    }

    // ----------------------------------------------------------------- anyone

    /// @notice Enforces every deadline. Callable by anyone (a relayer, a bot, either party).
    function finalize(uint256 id) external nonReentrant {
        Lease storage L = _leases[id];
        Status s = L.status;

        if (s == Status.Reserved) {
            // Landlord never handed the room over and never claimed a no-show: tenant gets the money back.
            if (block.timestamp <= uint256(L.moveInDeadline) + responseWindow) revert TooEarly();
            uint256 amount = L.balance;
            L.balance = 0;
            L.status = Status.Cancelled;
            landlordStats[L.landlord].ghosted++;
            _pay(id, L.tenant, amount);
            emit ReservationCancelled(id, address(0), 0, amount);
        } else if (s == Status.NoShowClaimed) {
            if (block.timestamp <= L.actionAt + responseWindow) revert TooEarly();
            tenantStats[L.tenant].ghosted++;
            _close(id, L, 0, L.balance, "no-show");
        } else if (s == Status.ReleaseRequested) {
            if (block.timestamp <= L.actionAt + responseWindow) revert TooEarly();
            _exitVault(id, L);
            landlordStats[L.landlord].timeouts++;
            _close(id, L, L.balance, 0, "landlord silent");
        } else if (s == Status.SettlementProposed) {
            if (block.timestamp <= L.actionAt + responseWindow) revert TooEarly();
            tenantStats[L.tenant].timeouts++;
            _settleAsProposed(id, L, "tenant silent");
        } else if (s == Status.Disputed) {
            if (block.timestamp <= L.actionAt + mediationTimeout) revert TooEarly();
            mediatorTimedOut[L.mediator]++;
            uint256 half = L.balance / 2;
            _close(id, L, L.balance - half, half, "mediator silent, split 50/50");
        } else {
            revert WrongStatus();
        }
    }

    function withdrawCredit() external nonReentrant {
        address who = _msgSender();
        uint256 amount = credit[who];
        credit[who] = 0;
        token.safeTransfer(who, amount);
    }

    // --------------------------------------------------------------- internal

    function _reserveChecks(uint256 id) internal returns (Lease storage L) {
        L = _leases[id];
        address sender = _msgSender();
        if (L.status != Status.Offered) revert WrongStatus();
        if (block.timestamp > L.moveInDeadline) revert TooLate();
        if (sender == L.landlord || sender == L.mediator) revert NotAllowed();
        if (L.tenant != address(0) && L.tenant != sender) revert NotAllowed();
        L.tenant = sender;
    }

    function _afterReserve(uint256 id, Lease storage L) internal {
        L.balance = L.holdAmount;
        L.status = Status.Reserved;
        _tenantLeases[L.tenant].push(id);
        emit Reserved(id, L.tenant, L.holdAmount);
    }

    function _moveInChecks(uint256 id, bytes32 conditionHash) internal view returns (Lease storage L, uint256 topUp) {
        L = _leases[id];
        if (L.status != Status.Reserved) revert WrongStatus();
        if (_msgSender() != L.tenant) revert NotAllowed();
        if (conditionHash == bytes32(0) || conditionHash != L.conditionHash) revert ConditionMismatch();
        topUp = L.depositAmount - L.holdAmount;
    }

    function _afterMoveIn(uint256 id, Lease storage L, bool acceptYield) internal {
        L.balance = L.depositAmount;
        L.status = Status.Active;
        L.activatedAt = uint64(block.timestamp);
        // Yield is only switched on when both sides opted in.
        if (acceptYield && L.landlordYieldOptIn && address(vault) != address(0)) {
            token.forceApprove(address(vault), L.balance);
            L.shares = vault.deposit(L.balance, address(this));
            L.yieldOn = true;
        }
        emit MovedIn(id, L.conditionHash, L.depositAmount, L.yieldOn);
    }

    function _pullWithAuth(address from, uint256 amount, Auth calldata a) internal {
        uint256 before = token.balanceOf(address(this));
        IERC3009(address(token)).receiveWithAuthorization(
            from, address(this), amount, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s
        );
        if (token.balanceOf(address(this)) - before != amount) revert BadParams();
    }

    /// @dev Pulls the deposit out of the vault and pays out the yield 50/50. If the vault lost
    ///      money, the lease balance shrinks and every later payout is computed on what is left.
    function _exitVault(uint256 id, Lease storage L) internal {
        if (!L.yieldOn) return;
        L.yieldOn = false;
        uint256 shares = L.shares;
        L.shares = 0;
        uint256 assets = vault.redeem(shares, address(this), address(this));
        if (assets > L.balance) {
            uint256 yield_ = assets - L.balance;
            uint256 toTenant = (yield_ * YIELD_TENANT_BPS) / BPS;
            _pay(id, L.tenant, toTenant);
            _pay(id, L.landlord, yield_ - toTenant);
            emit YieldPaid(id, toTenant, yield_ - toTenant);
        } else {
            L.balance = assets;
        }
    }

    function _settleAsProposed(uint256 id, Lease storage L, string memory reason) internal {
        _exitVault(id, L);
        uint256 toLandlord = L.proposedDeduction > L.balance ? L.balance : L.proposedDeduction;
        _close(id, L, L.balance - toLandlord, toLandlord, reason);
    }

    function _close(uint256 id, Lease storage L, uint256 toTenant, uint256 toLandlord, string memory reason)
        internal
    {
        L.balance = 0;
        L.status = Status.Closed;
        if (L.activatedAt != 0) {
            uint256 weight = L.depositAmount * (block.timestamp - L.activatedAt);
            Stats storage ls = landlordStats[L.landlord];
            Stats storage ts = tenantStats[L.tenant];
            ls.completed++;
            ts.completed++;
            ls.valueSeconds += weight;
            ts.valueSeconds += weight;
        }
        if (toTenant > 0) _pay(id, L.tenant, toTenant);
        if (toLandlord > 0) _pay(id, L.landlord, toLandlord);
        emit Closed(id, toTenant, toLandlord, reason);
    }

    /// @dev Push payment with a pull fallback, so one blocked address can never freeze a lease.
    function _pay(uint256 id, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
            emit Paid(id, to, amount);
        } else {
            credit[to] += amount;
            emit Credited(to, amount);
        }
    }
}
