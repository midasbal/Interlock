import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { appendDecision } from "./runlog.js";
import { currentChainHead } from "./auditTrail/chain.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// Deployed by the throwaway deployer on Base Sepolia, see docs/RUNLOG.md.
const AUDIT_ANCHOR = "0x0dDD39Da7c5f7DFe263cEE4866d1525895371E90";

// AuditAnchor is not verified on the block explorer, so KeeperHub cannot
// auto-fetch its ABI, this is the compiled ABI from contracts/out.
const AUDIT_ANCHOR_ABI = JSON.stringify([
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
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "committer", type: "address", indexed: true, internalType: "address" },
      { name: "digest", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "timestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
]);

/**
 * Commits the current audit-trail hash-chain head to AuditAnchor through the
 * gate itself, a real contract call, simulated, policy-checked, and effect-
 * verified like any other action. The anchor call becomes the next entry in
 * the chain after the digest is captured, so it commits to everything before
 * it, not to itself.
 */
async function main() {
  const digest = `0x${currentChainHead()}`;
  console.log(`anchoring current audit-trail chain head: ${digest}`);

  const gate = new Gate(new KeeperHubRestClient(), new EffectVerifier(WALLET_ADDRESS));

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: AUDIT_ANCHOR,
    functionName: "anchor",
    functionArgs: [digest],
    abi: AUDIT_ANCHOR_ABI,
    declaredEffect: {
      kind: "auditAnchor",
      contract: AUDIT_ANCHOR,
      committer: WALLET_ADDRESS,
      digest,
    },
    watchlist: [],
  });

  appendDecision("audit trail hash-chain anchor commit", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (!decision.allowed) {
    throw new Error(`expected the anchor commit to be allowed but the gate blocked it: ${decision.reason}`);
  }
  if (!decision.execution?.transactionHash) {
    throw new Error("expected a landed transaction hash but none was recorded");
  }

  console.log(`anchor tx: ${decision.execution.transactionHash}`);
  console.log(`digest: ${digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
