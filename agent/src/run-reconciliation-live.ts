import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { runWithReconciliation } from "./reconciler/postExecutionCheck.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const SELF_TRANSFER_WEI = "100000000000000"; // 0.0001 ETH

/**
 * Proves the optional post-execution reconciliation mode end to end: one
 * real, honest self-transfer runs through the gate as usual, wrapped in
 * runWithReconciliation. Nothing about the gate's own behavior changes,
 * this only adds an independent check afterward, see
 * agent/src/reconciler/postExecutionCheck.ts.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(
    client,
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

  const label = "reconciliation live check, honest self-transfer";
  const { decision, reconciliation } = await runWithReconciliation(
    gate,
    {
      kind: "transfer",
      chainId: "84532",
      to: WALLET_ADDRESS,
      valueEth: "0.0001",
      declaredEffect: { kind: "nativeTransfer", recipient: WALLET_ADDRESS, amountWei: SELF_TRANSFER_WEI },
      watchlist: [],
    },
    label,
    client,
    WALLET_ADDRESS
  );

  appendDecision(label, decision);

  if (!decision.allowed || !decision.execution?.transactionHash) {
    throw new Error(`expected the self-transfer to land but it did not: ${decision.reason}`);
  }
  if (!reconciliation) {
    throw new Error("expected a reconciliation result for a landed decision");
  }

  console.log(`transaction: ${decision.execution.transactionHash}`);
  console.log(`reconciliation verdict: ${reconciliation.verdict}`);

  if (reconciliation.verdict !== "reconciled") {
    console.warn("reconciliation flagged a divergence on an otherwise honest self-transfer, see docs/RUNLOG.md");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
