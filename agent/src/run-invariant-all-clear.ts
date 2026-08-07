import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendNote } from "./detectorRunlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// Distinct spender from the flagship breach script, kept clean on its own.
const ALL_CLEAR_SPENDER = "0xB1B1B1B1B1B1B1B1B1B1B1B1B1B1B1B1B1B1B1B1";
// Two approvals of 1,000,000 each, cumulative 2,000,000, well under the
// 5,000,000 cap in policy/invariants.json, both should land.
const PER_APPROVAL_AMOUNT = "1000000";

/**
 * The honest counterpart to the flagship breach: a sequence that stays
 * within every configured invariant throughout, and lands both times.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const invariantEngine = new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS);
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS), invariantEngine);

  const decisions = [];
  for (let i = 1; i <= 2; i++) {
    console.log(`submitting approval ${i} of 2: approve(${ALL_CLEAR_SPENDER}, ${PER_APPROVAL_AMOUNT})...`);
    const decision = await gate.run({
      kind: "contractCall",
      chainId: "84532",
      contractAddress: USDC_TOKEN,
      functionName: "approve",
      functionArgs: [ALL_CLEAR_SPENDER, PER_APPROVAL_AMOUNT],
      declaredEffect: {
        kind: "erc20Approve",
        token: USDC_TOKEN,
        owner: WALLET_ADDRESS,
        spender: ALL_CLEAR_SPENDER,
        allowanceBecomes: PER_APPROVAL_AMOUNT,
      },
      watchlist: [],
    });
    appendDecision(`invariant all-clear, approval ${i} of 2`, decision);
    console.log(`approval ${i}: allowed=${decision.allowed}, reason=${decision.reason}`);
    decisions.push(decision);
  }

  const [first, second] = decisions;

  if (!first.allowed || !first.execution?.transactionHash) {
    throw new Error("expected approval 1 to land");
  }
  if (!second.allowed || !second.execution?.transactionHash) {
    throw new Error("expected approval 2 to land");
  }
  if (first.invariants?.verdict !== "pass" || second.invariants?.verdict !== "pass") {
    throw new Error("expected both approvals to pass every invariant");
  }

  console.log(`approval 1 tx: ${first.execution.transactionHash}`);
  console.log(`approval 2 tx: ${second.execution.transactionHash}`);

  const allowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, ALL_CLEAR_SPENDER],
  });
  console.log(`confirmed allowance: ${allowance}`);
  if (String(allowance) !== PER_APPROVAL_AMOUNT) {
    throw new Error(`expected confirmed allowance ${PER_APPROVAL_AMOUNT} but read ${String(allowance)}`);
  }

  appendNote(
    "2026-08-08: invariant all-clear sequence",
    [
      `Spender: ${ALL_CLEAR_SPENDER}, per-approval amount: ${PER_APPROVAL_AMOUNT}, cap: 5000000.`,
      `Approval 1 landed: ${first.execution.transactionHash}, invariants passed.`,
      `Approval 2 landed: ${second.execution.transactionHash}, invariants passed, cumulative tally 2000000, under the cap.`,
      `Confirmed allowance on-chain: ${allowance}.`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
