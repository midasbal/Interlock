import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { SelfGateAgent } from "./selfGateAgent.js";
import { appendAgentRun } from "./agentRunlog.js";

// A well-known burn address, not in policy/policy.json's recipientAllowlist.
// Small amount, well within balance and the value cap, so this is
// unambiguously a policy block, not a balance or cap issue.
const NOT_ALLOWLISTED_RECIPIENT = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const gate = new Gate(new KeeperHubRestClient());
  const agent = new SelfGateAgent(gate);

  const run = await agent.proposeAndRun({
    chainId: "84532",
    to: NOT_ALLOWLISTED_RECIPIENT,
    valueEth: "0.00001",
  });

  appendAgentRun("containment case, policy block respected", run);
  console.log(JSON.stringify(run, null, 2));

  if (run.outcome !== "blocked-policy") {
    throw new Error(`expected a policy block, got outcome: ${run.outcome}`);
  }
  if (run.steps.length !== 1) {
    throw new Error("expected the agent to stop after exactly one attempt, no retry around policy");
  }
  if (run.steps[0].decision.execution) {
    throw new Error("expected nothing to be executed, but an execution was recorded");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
