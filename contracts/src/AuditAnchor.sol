// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// A minimal anchor contract. Anyone can commit a digest for their own
/// address, there is no access control and no upgradeability, its only job
/// is to make a digest independently verifiable on chain at a known block.
contract AuditAnchor {
    mapping(address => bytes32) public lastDigest;

    event Anchored(address indexed committer, bytes32 digest, uint256 timestamp);

    /// Records digest as the caller's latest anchor and emits it, both
    /// readable afterward as proof the digest existed at this block.
    function anchor(bytes32 digest) external {
        lastDigest[msg.sender] = digest;
        emit Anchored(msg.sender, digest, block.timestamp);
    }
}
