// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/// @notice SIMULATED yield source for the demo. It is a plain ERC-4626 vault: sending tokens
///         to it raises the share price, which is how the demo shows "interest".
///         A production deployment would point CocEscrow at a real ERC-4626 vault instead.
contract DemoYieldVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("Coc Demo Yield Vault", "cocUSDC") ERC4626(asset_) {}
}
