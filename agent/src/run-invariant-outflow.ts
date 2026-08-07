import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendNote } from "./detectorRunlog.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// A fixed external recipient for this demo, not the wallet itself, so every
// transfer to it is real outflow.
const OUTFLOW_RECIPIENT = "0xF4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4";
// policy/invariants.json bounds cumulative net outflow at 1,000,000,000,000,000
// wei (0.001 ETH). Three real transfers of 0.0004 ETH: the first two land
// (0.0004, then 0.0008 cumulative), the third would push the running total
// to 0.0012 ETH, over the bound, and is blocked. Native transfers accumulate
// for real on top of each other, unlike approve, so this invariant was
// already semantically sound before this fix, kept as is.
const PER_TRANSFER_AMOUNT_ETH = "0.0004";
const PER_TRANSFER_AMOUNT_WEI = "400000000000000";

async function transfer(gate: Gate, label: string) {
  console.log(`${label}: transfer ${PER_TRANSFER_AMOUNT_ETH} ETH to ${OUTFLOW_RECIPIENT}...`);
  const decision = await gate.run({
    kind: "transfer",
    chainId: "84532",
    to: OUTFLOW_RECIPIENT,
    valueEth: PER_TRANSFER_AMOUNT_ETH,
    declaredEffect: {
      kind: "nativeTransfer",
      recipient: OUTFLOW_RECIPIENT,
      amountWei: PER_TRANSFER_AMOUNT_WEI,
    },
    watchlist: [],
  });
  appendDecision(label, decision);
  console.log(`${label}: allowed=${decision.allowed}, reason=${decision.reason}`);
  return decision;
}

/**
 * The net-outflow demo: a real multi-transfer sequence where cumulative
 * outflow crosses the configured bound and the breaching transfer is
 * blocked purely by the outflow invariant, nothing broadcast.
 */
async function main() {
  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

  const first = await transfer(gate, "outflow transfer 1 of 3");
  const second = await transfer(gate, "outflow transfer 2 of 3");
  const third = await transfer(gate, "outflow transfer 3 of 3");

  if (!first.allowed || !first.execution?.transactionHash) {
    throw new Error("expected transfer 1 to land");
  }
  if (!second.allowed || !second.execution?.transactionHash) {
    throw new Error("expected transfer 2 to land");
  }
  if (third.allowed) {
    throw new Error("expected transfer 3 to be blocked by the cumulative net-outflow invariant");
  }
  if (third.invariants?.verdict !== "breach") {
    throw new Error("expected transfer 3 to be blocked specifically by an invariant");
  }
  const outflowCheck = third.invariants.checks.find((c) => c.name === "cumulative-net-outflow-bound");
  if (!outflowCheck || outflowCheck.passed) {
    throw new Error("expected the cumulative-net-outflow-bound check specifically to fail");
  }
  if (third.policy?.allowed !== true) {
    throw new Error("expected transfer 3 to pass policy on its own");
  }
  if (third.effectVerification?.verdict !== "match") {
    throw new Error("expected transfer 3 to pass effect verification on its own");
  }
  if (third.simulate !== undefined) {
    throw new Error("expected transfer 3 to be blocked before simulate runs");
  }
  if (third.execution) {
    throw new Error("expected nothing to be broadcast for the invariant-blocked transfer");
  }

  console.log(`transfer 1 tx: ${first.execution.transactionHash}`);
  console.log(`transfer 2 tx: ${second.execution.transactionHash}`);
  console.log(`transfer 3 blocked, nothing broadcast: ${third.reason}`);

  appendNote(
    "2026-08-09: net-outflow invariant, real multi-transfer breach",
    [
      `Recipient: ${OUTFLOW_RECIPIENT}, per-transfer amount ${PER_TRANSFER_AMOUNT_ETH} ETH, bound 0.001 ETH.`,
      `Transfer 1 landed: ${first.execution.transactionHash}, cumulative after commit 0.0004 ETH.`,
      `Transfer 2 landed: ${second.execution.transactionHash}, cumulative after commit 0.0008 ETH.`,
      `Transfer 3 blocked by the outflow invariant alone, policy and effect verification both passed on their own: ${third.reason}`,
      `Nothing broadcast for transfer 3.`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
