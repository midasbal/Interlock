import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendNote } from "./detectorRunlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// The three spenders configured in policy/invariants.json's
// allowanceExposure.monitoredSpenders, confirmed zero allowance before this
// script was written. Three different spenders, not repeated approvals to
// one, so the earlier flawed session-sum logic could never have caught this:
// each individual approval's resulting allowance (2,000,000) is well under
// the per-spender cap (3,000,000), only the real aggregate across all three
// monitored spenders can breach.
const SPENDER_A = "0xC1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1";
const SPENDER_B = "0xD2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2";
const SPENDER_C = "0xE3E3E3E3E3E3E3E3E3E3E3E3E3E3E3E3E3E3E3E3";
const PER_APPROVAL_AMOUNT = "2000000";

async function approve(
  client: KeeperHubRestClient,
  gate: Gate,
  label: string,
  spender: string
) {
  console.log(`${label}: approve(${spender}, ${PER_APPROVAL_AMOUNT})...`);
  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [spender, PER_APPROVAL_AMOUNT],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender,
      allowanceBecomes: PER_APPROVAL_AMOUNT,
    },
    watchlist: [],
  });
  appendDecision(label, decision);
  console.log(`${label}: allowed=${decision.allowed}, reason=${decision.reason}`);
  return decision;
}

async function readAllowance(client: KeeperHubRestClient, spender: string): Promise<string> {
  const allowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, spender],
  });
  return String(allowance);
}

/**
 * The corrected flagship case: real aggregate exposure across several
 * different spenders, not a session sum of one spender's approve amounts.
 * Two approvals land, the third is blocked purely by the aggregate-exposure
 * invariant, and the aggregate figure the invariant used is independently
 * confirmed to equal the sum of the actual on-chain allowances afterward.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS), new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS));

  const first = await approve(client, gate, "approval 1 of 3, spender A", SPENDER_A);
  const second = await approve(client, gate, "approval 2 of 3, spender B", SPENDER_B);
  const third = await approve(client, gate, "approval 3 of 3, spender C", SPENDER_C);

  if (!first.allowed || !first.execution?.transactionHash) {
    throw new Error("expected approval 1 to land");
  }
  if (!second.allowed || !second.execution?.transactionHash) {
    throw new Error("expected approval 2 to land");
  }
  if (third.allowed) {
    throw new Error("expected approval 3 to be blocked by the aggregate-exposure invariant");
  }
  if (third.invariants?.verdict !== "breach") {
    throw new Error("expected approval 3 to be blocked specifically by an invariant");
  }
  const aggregateCheck = third.invariants.checks.find((c) => c.name === "allowance-aggregate-exposure-cap");
  if (!aggregateCheck || aggregateCheck.passed) {
    throw new Error("expected the aggregate-exposure check specifically to fail");
  }
  const perSpenderCheck = third.invariants.checks.find((c) => c.name === "allowance-per-spender-cap");
  if (!perSpenderCheck || !perSpenderCheck.passed) {
    throw new Error("expected the per-spender cap to pass on its own, this action is individually well-formed");
  }
  if (third.policy?.allowed !== true) {
    throw new Error("expected approval 3 to pass policy on its own");
  }
  if (third.effectVerification?.verdict !== "match") {
    throw new Error("expected approval 3 to pass effect verification on its own");
  }
  if (third.simulate !== undefined) {
    throw new Error("expected approval 3 to be blocked before simulate runs");
  }
  if (third.execution) {
    throw new Error("expected nothing to be broadcast for the invariant-blocked approval");
  }

  console.log(`approval 1 tx: ${first.execution.transactionHash}`);
  console.log(`approval 1 KeeperHub execution id: ${first.execution.executionId}`);
  console.log(`approval 2 tx: ${second.execution.transactionHash}`);
  console.log(`approval 2 KeeperHub execution id: ${second.execution.executionId}`);
  console.log(`approval 3 blocked, nothing broadcast: ${third.reason}`);

  const allowanceA = await readAllowance(client, SPENDER_A);
  const allowanceB = await readAllowance(client, SPENDER_B);
  const allowanceC = await readAllowance(client, SPENDER_C);
  const invariantAggregate = aggregateCheck.detail.match(/would be (\d+)/)?.[1];

  console.log(`on-chain allowances right now: A=${allowanceA} B=${allowanceB} C=${allowanceC}`);
  console.log(`invariant's aggregate figure at the time of the block: ${invariantAggregate}`);

  if (allowanceC !== "0") {
    throw new Error("expected spender C's allowance to still be zero, approval 3 never landed");
  }

  // The invariant blocked the action before it signed, so its aggregate
  // figure is necessarily prospective: it is real landed exposure for A and
  // B, both already on-chain by this point, plus the resulting exposure
  // approval 3 was proposing for C, which never landed. That is the correct
  // number to check the cap against, and this confirms it was built from
  // real reads, not fabricated: real(A) + real(B) + proposed(C).
  const expectedAggregate = BigInt(allowanceA) + BigInt(allowanceB) + BigInt(PER_APPROVAL_AMOUNT);
  console.log(`expected aggregate (real A + real B + proposed C): ${expectedAggregate}`);
  if (expectedAggregate.toString() !== invariantAggregate) {
    throw new Error(
      `the invariant's aggregate figure (${invariantAggregate}) does not equal real(A) + real(B) + proposed(C) (${expectedAggregate}), the number it enforced on was not real`
    );
  }

  appendNote(
    "2026-08-09: corrected invariant flagship, real aggregate-exposure breach",
    [
      `Spenders: A=${SPENDER_A}, B=${SPENDER_B}, C=${SPENDER_C}, per-approval amount ${PER_APPROVAL_AMOUNT}, per-spender cap 3000000, aggregate cap 5000000.`,
      `Approval 1 (A) landed: ${first.execution.transactionHash}.`,
      `Approval 2 (B) landed: ${second.execution.transactionHash}.`,
      `Approval 3 (C) blocked by the aggregate-exposure invariant alone, per-spender cap and policy and effect verification all passed on their own: ${third.reason}`,
      `Nothing broadcast for approval 3, spender C's on-chain allowance confirmed still zero.`,
      `Independent confirmation: real(A)=${allowanceA} + real(B)=${allowanceB} + proposed(C)=${PER_APPROVAL_AMOUNT} = ${expectedAggregate}, exactly matching the aggregate figure (${invariantAggregate}) the invariant used to block approval 3, so the number it enforced on was real.`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
