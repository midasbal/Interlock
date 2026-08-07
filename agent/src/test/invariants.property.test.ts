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
 * breach an invariant is blocked before signing. The two arithmetic
 * properties (approval cap, net outflow bound) are checked directly against
 * InvariantEngine with many random sequences, still using real live reads
 * for the balance/watched-slot checks, just never broadcasting. The two
 * full-gate properties exercise the real decision path (live trace, live
 * simulate where reached) and are bounded in count since each makes real
 * network calls; only the explicitly marked allow-and-land case broadcasts.
 */

const WALLET = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const APPROVAL_CAP = 5_000_000n; // matches policy/invariants.json
const OUTFLOW_BOUND_WEI = 1_000_000_000_000_000n; // matches policy/invariants.json

function randomAddress(): string {
  const bytes = Array.from({ length: 20 }, () => randomInt(0, 256));
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

test("property: approval-cap invariant matches cumulative-sum arithmetic for random sequences [chain: live reads only, no broadcast]", async () => {
  const ITERATIONS = 30;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const engine = new InvariantEngine(loadInvariantConfig(), WALLET);
    const spender = randomAddress();
    let cumulative = 0n;

    const steps = 1 + randomInt(0, 4);
    for (let step = 0; step < steps; step++) {
      const amount = BigInt(1 + randomInt(0, 3_000_000));
      const action: ProposedAction = {
        kind: "contractCall",
        chainId: "84532",
        contractAddress: USDC_TOKEN,
        functionName: "approve",
        functionArgs: [spender, amount.toString()],
        declaredEffect: {
          kind: "erc20Approve",
          token: USDC_TOKEN,
          owner: WALLET,
          spender,
          allowanceBecomes: amount.toString(),
        },
        watchlist: [],
      };

      // An empty synthetic diff is real input, not a mock: the token-balance
      // and watched-slot checks still make live reads and correctly report
      // no change against it, this isolates the approval-cap arithmetic.
      const evaluation = await engine.evaluate(action, { pre: {}, post: {} });
      const prospective = cumulative + amount;
      const expectedBreach = prospective > APPROVAL_CAP;

      assert.equal(
        evaluation.verdict === "breach",
        expectedBreach,
        `iteration ${iter} step ${step}: cumulative ${cumulative} + amount ${amount} = ${prospective}, cap ${APPROVAL_CAP}, expected breach=${expectedBreach}, got ${evaluation.verdict}`
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

test("property: the real gate blocks any single approval whose amount alone exceeds the cap, nothing broadcast [chain: live trace, no broadcast]", async () => {
  const ITERATIONS = 8;
  for (let i = 0; i < ITERATIONS; i++) {
    const spender = randomAddress();
    const amount = (APPROVAL_CAP + 1n + BigInt(randomInt(0, 10_000_000))).toString();
    const gate = new Gate(
      new KeeperHubRestClient(),
      new EffectVerifier(WALLET),
      new InvariantEngine(loadInvariantConfig(), WALLET)
    );

    const decision = await gate.run({
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
    });
    appendDecision(`property test, guaranteed over-cap approval ${i + 1} of ${ITERATIONS}`, decision);

    assert.equal(decision.allowed, false, `amount ${amount} should breach the cap`);
    assert.equal(decision.invariants?.verdict, "breach");
    assert.equal(decision.simulate, undefined, "blocked before simulate runs");
    assert.equal(decision.execution, undefined, "nothing broadcast");
  }
});

test("property: a compliant randomized approval within the cap is allowed and its invariants verdict is pass [chain: lands a real tx]", async () => {
  const spender = randomAddress();
  const amount = (1n + BigInt(randomInt(0, 1_000_000))).toString();
  const gate = new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET),
    new InvariantEngine(loadInvariantConfig(), WALLET)
  );

  const decision = await gate.run({
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
  });
  appendDecision("property test, compliant randomized approval, allow-and-land", decision);

  assert.equal(decision.allowed, true, decision.reason);
  assert.equal(decision.invariants?.verdict, "pass");
  assert.ok(decision.execution?.transactionHash, "expected a landed transaction hash");
});
