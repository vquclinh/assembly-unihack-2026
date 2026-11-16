// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice The part of CocEscrow the badge needs: the landlord's objective track record.
interface ICocEscrowStats {
    function landlordStats(address landlord)
        external
        view
        returns (
            uint32 completed,
            uint32 amicable,
            uint32 disputes,
            uint32 disputesLost,
            uint32 timeouts,
            uint32 ghosted,
            uint256 valueSeconds
        );
}

/// @title CocBadge - soulbound "Trusted landlord" credential
/// @notice A landlord claims one badge once the escrow has recorded enough clean leases.
///         The badge cannot be transferred (ERC-5192), and anyone can revoke it as soon as
///         the holder's record no longer meets the rules, so it always matches the chain.
///         Other contracts (a university housing list, a listing site) can call `isTrusted`.
contract CocBadge is ERC721, ERC2771Context {
    using Strings for uint256;
    using Strings for address;

    /// @dev ERC-5192: emitted once when a token is minted, because every token is locked.
    event Locked(uint256 tokenId);
    event Claimed(address indexed holder, uint256 indexed tokenId);
    event Revoked(address indexed holder, uint256 indexed tokenId, address indexed by);

    error NotEligible();
    error AlreadyHolder();
    error NoBadge();
    error StillEligible();
    error Soulbound();

    ICocEscrowStats public immutable escrow;
    /// @notice Minimum number of leases that reached move-in and then closed.
    uint32 public immutable minCompleted;
    /// @notice Minimum deposit-seconds held (USDC base units x seconds), which makes farming costly.
    uint256 public immutable minValueSeconds;

    uint256 public totalIssued;
    mapping(address => uint256) public badgeOf;
    mapping(uint256 => uint64) public issuedAt;

    constructor(address escrow_, address forwarder, uint32 minCompleted_, uint256 minValueSeconds_)
        ERC721("Coc Trusted Landlord", "COCTL")
        ERC2771Context(forwarder)
    {
        escrow = ICocEscrowStats(escrow_);
        minCompleted = minCompleted_;
        minValueSeconds = minValueSeconds_;
    }

    // ------------------------------------------------------------------ rules

    /// @notice A landlord qualifies with enough completed leases, no ghosted reservations,
    ///         no silences that forced a timeout, and at most one lost dispute in five leases.
    function eligible(address landlord) public view returns (bool) {
        (uint32 completed,,, uint32 disputesLost, uint32 timeouts, uint32 ghosted, uint256 valueSeconds) =
            escrow.landlordStats(landlord);
        return completed >= minCompleted && valueSeconds >= minValueSeconds && ghosted == 0 && timeouts == 0
            && uint256(disputesLost) * 5 <= completed;
    }

    /// @notice True while the landlord holds a badge and still meets the rules.
    function isTrusted(address landlord) external view returns (bool) {
        return badgeOf[landlord] != 0 && eligible(landlord);
    }

    // ------------------------------------------------------------------ actions

    function claim() external returns (uint256 tokenId) {
        address sender = _msgSender();
        if (badgeOf[sender] != 0) revert AlreadyHolder();
        if (!eligible(sender)) revert NotEligible();
        tokenId = ++totalIssued;
        badgeOf[sender] = tokenId;
        issuedAt[tokenId] = uint64(block.timestamp);
        _mint(sender, tokenId);
        emit Locked(tokenId);
        emit Claimed(sender, tokenId);
    }

    /// @notice Anyone may burn a badge whose holder no longer qualifies.
    function revoke(address holder) external {
        uint256 tokenId = badgeOf[holder];
        if (tokenId == 0) revert NoBadge();
        if (eligible(holder)) revert StillEligible();
        delete badgeOf[holder];
        _burn(tokenId);
        emit Revoked(holder, tokenId, _msgSender());
    }

    // ------------------------------------------------------------------ ERC-5192

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    /// @dev Only minting and burning move tokens. Transfers and approvals are disabled.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ------------------------------------------------------------------ metadata

    /// @notice Fully on-chain metadata and image, with the holder's live record.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address holder = _requireOwned(tokenId);
        (uint32 completed, uint32 amicable, uint32 disputes,,,,) = escrow.landlordStats(holder);
        string memory addr = holder.toHexString();
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#0a0a0b"/>',
            '<rect x="24" y="24" width="352" height="352" fill="none" stroke="#3f3f46"/>',
            '<rect x="24" y="24" width="352" height="4" fill="#e84142"/>',
            '<rect x="48" y="60" width="56" height="56" fill="#e84142"/>',
            '<path d="M90 78a14 14 0 1 0 0 20" fill="none" stroke="#fff" stroke-width="6"/>',
            '<text x="48" y="168" fill="#e84142" font-family="monospace" font-size="13" letter-spacing="3">COC TRUSTED LANDLORD</text>',
            '<text x="48" y="206" fill="#fff" font-family="sans-serif" font-size="30" font-weight="700">Badge #',
            tokenId.toString(),
            "</text>",
            _statLine(250, "Completed leases", uint256(completed)),
            _statLine(280, "Closed amicably", uint256(amicable)),
            _statLine(310, "Disputes", uint256(disputes)),
            '<text x="48" y="352" fill="#71717a" font-family="monospace" font-size="10">',
            addr,
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"Coc Trusted Landlord #',
            tokenId.toString(),
            '","description":"Soulbound credential issued by the Coc rental deposit escrow on Avalanche. Revocable by anyone if the holder stops meeting the rules.","attributes":[',
            '{"trait_type":"Completed leases","value":',
            uint256(completed).toString(),
            '},{"trait_type":"Closed amicably","value":',
            uint256(amicable).toString(),
            '},{"trait_type":"Disputes","value":',
            uint256(disputes).toString(),
            '},{"display_type":"date","trait_type":"Issued","value":',
            uint256(issuedAt[tokenId]).toString(),
            '}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _statLine(uint256 y, string memory label, uint256 value) private pure returns (string memory) {
        return string.concat(
            '<text x="48" y="',
            y.toString(),
            '" fill="#a1a1aa" font-family="sans-serif" font-size="15">',
            label,
            '</text><text x="352" y="',
            y.toString(),
            '" fill="#fff" font-family="monospace" font-size="15" text-anchor="end">',
            value.toString(),
            "</text>"
        );
    }

    // ------------------------------------------------------------------ ERC-2771 plumbing

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
