import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { appendDecision } from "./runlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TEST_SPENDER = "0x1234567890123456789012345678901234567890";

/**
 * The target contract IS allowlisted (this is the same USDC token used for
 * the grant/revoke proof), but "transfer" is not in the function allowlist,
 * only "approve" is. Amount is 0, confirmed live to pass simulate (a
 * zero-value ERC-20 transfer does not revert even with a zero balance), so
 * this isolates a pure function-allowlist policy block from a simulate
 * revert, distinct from the case above.
 */
async function main() {
  const gate = new Gate(new KeeperHubRestClient());

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "transfer",
    functionArgs: [TEST_SPENDER, "0"],
  });

  appendDecision("contract-call policy block (function not allowlisted)", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (decision.allowed) {
    throw new Error("expected a policy block but the gate allowed it");
  }
  if (decision.policy.allowed) {
    throw new Error("expected the policy check specifically to fail");
  }
  if (decision.simulate.wouldRevert) {
    throw new Error("expected simulate to pass, so this is an isolated policy block, not a revert");
  }
  if (decision.execution) {
    throw new Error("expected nothing to be executed, but an execution was recorded");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
