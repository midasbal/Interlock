import { test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { KeeperHubRestClient } from "../keeperhub/restClient.js";
import { Gate } from "../gate.js";
import { EffectVerifier } from "../effectVerifier/verifier.js";
import { InvariantEngine } from "../invariants/engine.js";
import { loadInvariantConfig } from "../invariants/loadInvariantConfig.js";
import { appendDecision } from "../runlog.js";
import type { ProposedAction } from "../../../policy/types.js";

/**
 * Property-based cases against the real invariant engine and the real gate,
 * no mocking. The core correctness claim under test: everything the gate
 * allows satisfies every configured invariant, and everything that would
 * breach an invariant is blocked before signing.
 *
 * Allowance exposure (per-spender cap and aggregate cap) is measured from
 * real outstanding allowance, so, unlike the old flawed session-sum model,
 * it cannot be property-tested as pure arithmetic against synthetic input:
 * the correct answer depends on real on-chain state. Those two properties
 * run against the real gate path (live trace, and for the aggregate case
 * one real landed approval to establish real prior state), bounded in count
 * since each makes real network calls. The net-outflow bound is unchanged
 * (transfers genuinely accumulate) and is still checked as pure cumulative-
 * sum arithmetic against InvariantEngine directly, with many random
 * sequences, using live reads for the balance/watched-slot checks, never a
 * mock, never broadcasting.
 */

const WALLET = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PER_SPENDER_CAP = 3_000_000n; // matches policy/invariants.json
const AGGREGATE_CAP = 5_000_000n; // matches policy/invariants.json
const OUTFLOW_BOUND_WEI = 1_000_000_000_000_000n; // matches policy/invariants.json

// The two of three monitoredSpenders not otherwise used by the flagship or
// all-clear scripts' final state assumptions, safe to approve here.
const MONITORED_SPENDER_A = "0xC1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1";
const MONITORED_SPENDER_B = "0xD2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2";

function randomAddress(): string {
  const bytes = Array.from({ length: 20 }, () => randomInt(0, 256));
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function approveAction(spender: string, amount: string): ProposedAction {
  return {
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [spender, amount],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET,
      spender,
      allowanceBecomes: amount,
    },
    watchlist: [],
  };
}

test("property: cumulative net outflow bound matches running-sum arithmetic for random transfer sequences [chain: live reads only, no broadcast]", async () => {
  const ITERATIONS = 30;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const engine = new InvariantEngine(loadInvariantConfig(), WALLET);
    const recipient = randomAddress();
    let cumulative = 0n;

    const steps = 1 + randomInt(0, 4);
    for (let step = 0; step < steps; step++) {
      // crypto.randomInt caps at 2^48-1, well under the wei ranges we want
      // to cover, so the amount is composed from two smaller random draws.
      const amountWei = BigInt(1 + randomInt(0, 500_000)) * 1_000_000_000n;
      const action: ProposedAction = {
        kind: "transfer",
        chainId: "84532",
        to: recipient,
        valueEth: "0",
        declaredEffect: { kind: "nativeTransfer", recipient, amountWei: amountWei.toString() },
        watchlist: [],
      };

      const evaluation = await engine.evaluate(action, { pre: {}, post: {} });
      const prospective = cumulative + amountWei;
      const expectedBreach = prospective > OUTFLOW_BOUND_WEI;

      assert.equal(
        evaluation.verdict === "breach",
        expectedBreach,
        `iteration ${iter} step ${step}: cumulative ${cumulative} + amount ${amountWei} = ${prospective}, bound ${OUTFLOW_BOUND_WEI}, expected breach=${expectedBreach}, got ${evaluation.verdict}`
      );

      if (evaluation.verdict === "pass") {
        engine.commit(action);
        cumulative = prospective;
      } else {
        break;
      }
    }
  }
});

test("property: the real gate blocks any single approval whose resulting allowance alone exceeds the per-spender cap, nothing broadcast [chain: live trace, no broadcast]", async () => {
  const ITERATIONS = 8;
  for (let i = 0; i < ITERATIONS; i++) {
    const spender = randomAddress();
    const amount = (PER_SPENDER_CAP + 1n + BigInt(randomInt(0, 10_000_000))).toString();
    const gate = new Gate(
      new KeeperHubRestClient(),
      new EffectVerifier(WALLET),
      new InvariantEngine(loadInvariantConfig(), WALLET)
    );

    const decision = await gate.run(approveAction(spender, amount));
    appendDecision(`property test, guaranteed over-per-spender-cap approval ${i + 1} of ${ITERATIONS}`, decision);

    assert.equal(decision.allowed, false, `amount ${amount} should breach the per-spender cap`);
    assert.equal(decision.invariants?.verdict, "breach");
    const perSpenderCheck = decision.invariants?.checks.find((c) => c.name === "allowance-per-spender-cap");
    assert.equal(perSpenderCheck?.passed, false, "expected the per-spender-cap check specifically to fail");
    assert.equal(decision.simulate, undefined, "blocked before simulate runs");
    assert.equal(decision.execution, undefined, "nothing broadcast");
  }
});

test("property: the real gate allows two individually well-formed approvals whose real aggregate exposure breaches the aggregate cap, second is blocked [chain: one real landed approval, then live trace, no broadcast for the breach]", async () => {
  // A is randomized but bounded so it alone never breaches the per-spender
  // cap; B is fixed at the per-spender cap itself. A + B always exceeds the
  // aggregate cap (5,000,000) while neither individually exceeds the
  // per-spender cap (3,000,000), so only the aggregate check can catch it.
  const amountA = (2_000_001n + BigInt(randomInt(0, 999_999))).toString();
  const amountB = PER_SPENDER_CAP.toString();

  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET), new InvariantEngine(loadInvariantConfig(), WALLET));

  // Read spender B's real allowance before this test touches it, other
  // scripts (the flagship demo included) may also use this address, so the
  // correctness check below is "unchanged by this blocked attempt", not an
  // assumption that it starts at zero.
  const allowanceBBefore = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET, MONITORED_SPENDER_B],
  });

  const first = await gate.run(approveAction(MONITORED_SPENDER_A, amountA));
  appendDecision("property test, aggregate exposure setup approval (lands)", first);
  assert.equal(first.allowed, true, first.reason);
  assert.ok(first.execution?.transactionHash, "expected the setup approval to land");

  const second = await gate.run(approveAction(MONITORED_SPENDER_B, amountB));
  appendDecision("property test, aggregate exposure breach approval (blocked)", second);

  assert.equal(second.allowed, false, `A=${amountA} + B=${amountB} should breach the aggregate cap`);
  assert.equal(second.policy?.allowed, true, "expected policy to pass on its own");
  assert.equal(second.effectVerification?.verdict, "match", "expected effect verification to pass on its own");
  assert.equal(second.invariants?.verdict, "breach");
  const perSpenderCheck = second.invariants?.checks.find((c) => c.name === "allowance-per-spender-cap");
  assert.equal(perSpenderCheck?.passed, true, "expected the per-spender-cap check to pass, B alone is under its own cap");
  const aggregateCheck = second.invariants?.checks.find((c) => c.name === "allowance-aggregate-exposure-cap");
  assert.equal(aggregateCheck?.passed, false, "expected the aggregate-exposure check specifically to fail");
  assert.equal(second.simulate, undefined, "blocked before simulate runs");
  assert.equal(second.execution, undefined, "nothing broadcast");

  const allowanceA = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET, MONITORED_SPENDER_A],
  });
  const allowanceBAfter = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET, MONITORED_SPENDER_B],
  });
  assert.equal(String(allowanceA), amountA, "spender A's real allowance should equal the landed approval");
  assert.equal(
    String(allowanceBAfter),
    String(allowanceBBefore),
    "spender B's real allowance should be unchanged, that approval never landed"
  );
});

test("property: a compliant randomized approval within both caps is allowed and every invariant passes [chain: lands a real tx]", async () => {
  const spender = randomAddress();
  const amount = (1n + BigInt(randomInt(0, 1_000_000))).toString();
  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET),
    new InvariantEngine(loadInvariantConfig(), WALLET)
  );

  const decision = await gate.run(approveAction(spender, amount));
  appendDecision("property test, compliant randomized approval, allow-and-land", decision);

  assert.equal(decision.allowed, true, decision.reason);
  assert.equal(decision.invariants?.verdict, "pass");
  assert.ok(decision.execution?.transactionHash, "expected a landed transaction hash");
});
