// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// A minimal anchor contract. Anyone can commit a digest for their own
/// address, there is no access control and no upgradeability, its only job
/// is to make a digest independently verifiable on chain at a known block.
contract AuditAnchor {
    mapping(address => bytes32) public lastDigest;
    mapping(address => mapping(bytes32 => bytes32)) public keyedDigest;

    event Anchored(address indexed committer, bytes32 digest, uint256 timestamp);
    event AnchoredKeyed(address indexed committer, bytes32 indexed key, bytes32 digest, uint256 timestamp);

    /// Records digest as the caller's latest anchor and emits it, both
    /// readable afterward as proof the digest existed at this block.
    function anchor(bytes32 digest) external {
        lastDigest[msg.sender] = digest;
        emit Anchored(msg.sender, digest, block.timestamp);
    }

    /// Same idea as anchor, but keyed, so a caller can commit more than one
    /// independent digest, for example one for an audit trail and a
    /// separate one for a policy configuration, without one overwriting
    /// the other.
    function anchorKeyed(bytes32 key, bytes32 digest) external {
        keyedDigest[msg.sender][key] = digest;
        emit AnchoredKeyed(msg.sender, key, digest, block.timestamp);
    }
}
