import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendNote } from "./detectorRunlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// A demo spender for this proof only, not a real protocol. Distinct from
// every other spender used elsewhere in this project so the session tally
// this script builds is easy to read on its own.
const FLAGSHIP_SPENDER = "0x9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A";
// policy/invariants.json caps cumulative approval to a single spender at
// 5,000,000 for this token. Three approvals of 2,000,000 each: the first two
// land (2,000,000 then 4,000,000 cumulative), the third would push the
// running tally to 6,000,000, over the cap, and is blocked by the invariant
// alone, each approval is individually well-formed and passes policy and
// effect verification on its own.
const PER_APPROVAL_AMOUNT = "2000000";

/**
 * The flagship case: a sequence of individually clean actions, each passing
 * policy and effect verification, where a later one breaches a cumulative
 * invariant that no single action's own checks could ever catch.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const invariantEngine = new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS);
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS), invariantEngine);

  const decisions = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`submitting approval ${i} of 3: approve(${FLAGSHIP_SPENDER}, ${PER_APPROVAL_AMOUNT})...`);
    const decision = await gate.run({
      kind: "contractCall",
      chainId: "84532",
      contractAddress: USDC_TOKEN,
      functionName: "approve",
      functionArgs: [FLAGSHIP_SPENDER, PER_APPROVAL_AMOUNT],
      declaredEffect: {
        kind: "erc20Approve",
        token: USDC_TOKEN,
        owner: WALLET_ADDRESS,
        spender: FLAGSHIP_SPENDER,
        allowanceBecomes: PER_APPROVAL_AMOUNT,
      },
      watchlist: [],
    });
    appendDecision(`invariant flagship, approval ${i} of 3`, decision);
    console.log(`approval ${i}: allowed=${decision.allowed}, reason=${decision.reason}`);
    decisions.push(decision);
  }

  const [first, second, third] = decisions;

  if (!first.allowed || !first.execution?.transactionHash) {
    throw new Error("expected approval 1 to land");
  }
  if (!second.allowed || !second.execution?.transactionHash) {
    throw new Error("expected approval 2 to land");
  }
  if (third.allowed) {
    throw new Error("expected approval 3 to be blocked by the cumulative approval-cap invariant");
  }
  if (third.invariants?.verdict !== "breach") {
    throw new Error("expected approval 3 to be blocked specifically by an invariant");
  }
  if (third.policy?.allowed !== true) {
    throw new Error("expected approval 3 to pass policy on its own, individually well-formed");
  }
  if (third.effectVerification?.verdict !== "match") {
    throw new Error("expected approval 3 to pass effect verification on its own, individually well-formed");
  }
  if (third.simulate !== undefined) {
    throw new Error("expected approval 3 to be blocked before simulate runs");
  }
  if (third.execution) {
    throw new Error("expected nothing to be broadcast for the invariant-blocked approval");
  }

  console.log(`approval 1 tx: ${first.execution.transactionHash}`);
  console.log(`approval 2 tx: ${second.execution.transactionHash}`);
  console.log(`approval 3 blocked, nothing broadcast: ${third.reason}`);

  appendNote(
    "2026-08-08: invariant flagship, cumulative approval-cap breach",
    [
      `Spender: ${FLAGSHIP_SPENDER}, per-approval amount: ${PER_APPROVAL_AMOUNT}, cap: 5000000.`,
      `Approval 1 landed: ${first.execution.transactionHash}, cumulative tally after commit: 2000000.`,
      `Approval 2 landed: ${second.execution.transactionHash}, cumulative tally after commit: 4000000.`,
      `Approval 3 blocked by invariant, not policy or effect verification (both passed on their own): ${third.reason}`,
      `Nothing broadcast for approval 3.`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
