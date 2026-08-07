import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { computePolicyConfigDigest } from "./policyConfigHash.js";
import { AUDIT_ANCHOR, AUDIT_ANCHOR_ABI } from "./auditAnchorContract.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// keccak256("interlock-policy-config"), confirmed live with cast keccak. A
// fixed key so this digest never collides with the audit-trail head digest
// committed under the plain anchor() function on the same contract.
const POLICY_CONFIG_KEY = "0xec59c188d5be9b652f85ad8db3548e57db05b51c4a83911b147e574925e6d26e";

/**
 * Commits a digest of the exact, currently governing policy.json and
 * invariants.json to AuditAnchor's keyed slot, through the gate itself. The
 * point: every decision the gate makes can be bound to a specific, published
 * rule set, not just a claim about what the rules were.
 */
async function main() {
  const digest = `0x${computePolicyConfigDigest()}`;
  console.log(`anchoring current policy-and-invariant configuration digest: ${digest}`);

  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: AUDIT_ANCHOR,
    functionName: "anchorKeyed",
    functionArgs: [POLICY_CONFIG_KEY, digest],
    abi: AUDIT_ANCHOR_ABI,
    declaredEffect: {
      kind: "keyedAnchor",
      contract: AUDIT_ANCHOR,
      committer: WALLET_ADDRESS,
      key: POLICY_CONFIG_KEY,
      digest,
    },
    watchlist: [],
  });

  appendDecision("policy-and-invariant configuration anchor commit", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (!decision.allowed) {
    throw new Error(`expected the policy anchor commit to be allowed but the gate blocked it: ${decision.reason}`);
  }
  if (!decision.execution?.transactionHash) {
    throw new Error("expected a landed transaction hash but none was recorded");
  }

  console.log(`policy anchor tx: ${decision.execution.transactionHash}`);
  console.log(`policy digest: ${digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
