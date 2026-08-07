// Deployed by the throwaway deployer on Base Sepolia, see docs/RUNLOG.md.
export const AUDIT_ANCHOR = "0x174Aa8859aFFCFC0E8C8C30Ed320f95541D075f4";

// AuditAnchor is not verified on the block explorer, so KeeperHub cannot
// auto-fetch its ABI, this is the compiled ABI from contracts/out.
export const AUDIT_ANCHOR_ABI = JSON.stringify([
  {
    type: "function",
    name: "anchor",
    inputs: [{ name: "digest", type: "bytes32", internalType: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "lastDigest",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "anchorKeyed",
    inputs: [
      { name: "key", type: "bytes32", internalType: "bytes32" },
      { name: "digest", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "keyedDigest",
    inputs: [
      { name: "", type: "address", internalType: "address" },
      { name: "", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "committer", type: "address", indexed: true, internalType: "address" },
      { name: "digest", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "timestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AnchoredKeyed",
    inputs: [
      { name: "committer", type: "address", indexed: true, internalType: "address" },
      { name: "key", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "digest", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "timestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
]);
