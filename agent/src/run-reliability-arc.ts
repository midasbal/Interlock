import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { ethStringToWei } from "./effectVerifier/units.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { SelfGateAgent } from "./selfGateAgent.js";
import { appendAgentRun } from "./agentRunlog.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// Deliberately above the confirmed 0.015 ETH balance (see docs/RUNLOG.md), so
// the first simulate genuinely would revert. Nothing about this is staged,
// the amount is real and the wallet really cannot cover it.
const AMOUNT_ABOVE_BALANCE = "0.02";

async function main() {
  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );
  const agent = new SelfGateAgent(gate);

  const run = await agent.proposeAndRun({
    kind: "transfer",
    chainId: "84532",
    to: WALLET_ADDRESS,
    valueEth: AMOUNT_ABOVE_BALANCE,
    declaredEffect: {
      kind: "nativeTransfer",
      recipient: WALLET_ADDRESS,
      amountWei: ethStringToWei(AMOUNT_ABOVE_BALANCE).toString(),
    },
    watchlist: [],
  });

  appendAgentRun("reliability arc, block then adapt then land", run);
  console.log(JSON.stringify(run, null, 2));

  if (run.outcome !== "landed") {
    throw new Error(`expected the reliability arc to land, got outcome: ${run.outcome}`);
  }
  if (run.steps.length < 2) {
    throw new Error("expected at least a blocked first attempt and a landed retry");
  }
  if (run.steps[0].decision.allowed) {
    throw new Error("expected the first attempt to be blocked by simulate, not allowed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
