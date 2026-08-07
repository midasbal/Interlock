// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// Benign v1 implementation for the capability 3 phase B demo stage. The
/// proxy is a stand-in "spender" contract whose EIP-1967 implementation slot
/// the detector watches; this contract does nothing with any approval itself.
contract SpenderV1 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function version() external pure returns (string memory) {
        return "v1";
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
