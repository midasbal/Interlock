// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// A distinct implementation from SpenderV1, standing in for an unexpected
/// code change at the spender address. It is not malicious, a plain distinct
/// implementation is enough to make the proxy's implementation slot change
/// for real, which is what the detector in capability 3 phase B reacts to.
contract SpenderV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function version() external pure returns (string memory) {
        return "v2";
    }

    function extraFunction() external pure returns (bool) {
        return true;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
