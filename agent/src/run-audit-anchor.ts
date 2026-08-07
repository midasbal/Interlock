import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { currentChainHead } from "./auditTrail/chain.js";
import { AUDIT_ANCHOR, AUDIT_ANCHOR_ABI } from "./auditAnchorContract.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

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

  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

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
