import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const TEST_SPENDER = "0x1234567890123456789012345678901234567890";

/**
 * The target contract IS allowlisted (this is the same USDC token used for
 * the grant/revoke proof), but "transfer" is not in the function allowlist,
 * only "approve" is. Policy now runs before effect verification and before
 * simulate, so this blocks at the earliest possible stage, neither of the
 * later stages ever runs. The declaredEffect below is a placeholder, never
 * evaluated, since policy blocks first.
 */
async function main() {
  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "transfer",
    functionArgs: [TEST_SPENDER, "0"],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: TEST_SPENDER,
      allowanceBecomes: "0",
    },
    watchlist: [],
  });

  appendDecision("contract-call policy block (function not allowlisted)", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (decision.allowed) {
    throw new Error("expected a policy block but the gate allowed it");
  }
  if (decision.policy?.allowed !== false) {
    throw new Error("expected the policy check specifically to fail");
  }
  if (decision.effectVerification !== undefined) {
    throw new Error("expected effect verification to be skipped, blocked at policy first");
  }
  if (decision.simulate !== undefined) {
    throw new Error("expected simulate to be skipped, blocked at policy first");
  }
  if (decision.execution) {
    throw new Error("expected nothing to be executed, but an execution was recorded");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
