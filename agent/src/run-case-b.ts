import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { appendDecision } from "./runlog.js";

// A well-known burn address, not our wallet: not in policy/policy.json's
// recipientAllowlist. Value is small and well within balance so this proves
// a POLICY block, distinct from the balance-revert already recorded in
// docs/RUNLOG.md.
const NOT_ALLOWLISTED_RECIPIENT = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const gate = new Gate(new KeeperHubRestClient());

  const decision = await gate.run({
    chainId: "84532",
    to: NOT_ALLOWLISTED_RECIPIENT,
    valueEth: "0.00001",
  });

  appendDecision("Case B, policy block (recipient not allowlisted)", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (decision.allowed) {
    throw new Error("Case B was expected to be blocked but the gate allowed it");
  }
  if (decision.execution) {
    throw new Error("Case B was expected not to execute anything but an execution was recorded");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
