// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @notice Relays signed requests so tenants and landlords never need AVAX for gas.
contract CocForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("CocForwarder") {}
}
