import { test } from "node:test";
import assert from "node:assert/strict";
import { KeeperHubRestClient } from "../keeperhub/restClient.js";
import { Gate } from "../gate.js";
import { EffectVerifier } from "../effectVerifier/verifier.js";
import { InvariantEngine } from "../invariants/engine.js";
import { loadInvariantConfig } from "../invariants/loadInvariantConfig.js";
import { appendDecision } from "../runlog.js";
import type { FreezeGuard } from "../freezeGuard.js";

/**
 * Adversarial cases against the real gate, no mocking of the gate's own
 * logic: policy, effect verification, simulate, and freeze checks all run
 * for real. Where a case needs the chain it makes a real, read-only call
 * (a live debug_traceCall trace or a live KeeperHub simulate), labeled in
 * the test name. Only the two explicit allow-and-land cases broadcast a
 * real transaction on Base Sepolia.
 */

const WALLET = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NOT_ALLOWLISTED_CONTRACT = "0x9999999999999999999999999999999999999a";
const DECLARED_SPENDER = "0x6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D";
const ACTUAL_SPENDER = "0x7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E7E";
const LAND_SPENDER = "0x8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F8F";

function buildGate(freezeGuards: FreezeGuard[] = []) {
  return new Gate(
    new KeeperHubRestClient(),
    new EffectVerifier(WALLET),
    new InvariantEngine(loadInvariantConfig(), WALLET),
    undefined,
    freezeGuards
  );
}

test("policy: target contract not allowlisted blocks, nothing broadcast [no chain call]", async () => {
  const decision = await buildGate().run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: NOT_ALLOWLISTED_CONTRACT,
    functionName: "approve",
    functionArgs: [DECLARED_SPENDER, "1"],
    declaredEffect: {
      kind: "erc20Approve",
      token: NOT_ALLOWLISTED_CONTRACT,
      owner: WALLET,
      spender: DECLARED_SPENDER,
      allowanceBecomes: "1",
    },
    watchlist: [],
  });
  appendDecision("red-team: target contract not allowlisted", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy?.allowed, false);
  assert.equal(decision.effectVerification, undefined, "blocked before effect verification runs");
  assert.equal(decision.simulate, undefined, "blocked before simulate runs");
  assert.equal(decision.execution, undefined, "nothing broadcast");
});

test("policy: function not allowlisted blocks, nothing broadcast [no chain call]", async () => {
  const decision = await buildGate().run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "transfer",
    functionArgs: [DECLARED_SPENDER, "0"],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET,
      spender: DECLARED_SPENDER,
      allowanceBecomes: "0",
    },
    watchlist: [],
  });
  appendDecision("red-team: function not allowlisted", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy?.allowed, false);
  assert.match(decision.reason, /function/);
  assert.equal(decision.execution, undefined);
});

test("policy: value over the declared cap blocks, nothing broadcast [no chain call]", async () => {
  const decision = await buildGate().run({
    kind: "transfer",
    chainId: "84532",
    to: WALLET,
    valueEth: "0.03",
    declaredEffect: { kind: "nativeTransfer", recipient: WALLET, amountWei: "30000000000000000" },
    watchlist: [],
  });
  appendDecision("red-team: value over the declared cap", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy?.allowed, false);
  assert.match(decision.reason, /cap/);
  assert.equal(decision.execution, undefined);
});

test("effect mismatch: declared spender does not match the actual call, blocks before simulate [chain: live trace, read-only]", async () => {
  const decision = await buildGate().run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [ACTUAL_SPENDER, "2000000"],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET,
      spender: DECLARED_SPENDER,
      allowanceBecomes: "2000000",
    },
    watchlist: [],
  });
  appendDecision("red-team: effect mismatch (declared spender != actual spender)", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy?.allowed, true, "target and function are both allowlisted");
  assert.equal(decision.effectVerification?.verdict, "mismatch");
  assert.equal(decision.simulate, undefined, "blocked before simulate runs");
  assert.equal(decision.execution, undefined);
});

test("would-revert: self-transfer above balance but under the policy cap blocks at simulate, nothing broadcast [chain: live KeeperHub simulate, read-only]", async () => {
  // 0.019 ETH: under the 0.02 ETH policy cap (so policy passes), above the
  // wallet's real balance of about 0.015 ETH (so this genuinely would
  // revert). Picking an amount above the cap would block at policy instead
  // and never reach simulate, which is not what this case is testing.
  const decision = await buildGate().run({
    kind: "transfer",
    chainId: "84532",
    to: WALLET,
    valueEth: "0.019",
    declaredEffect: { kind: "nativeTransfer", recipient: WALLET, amountWei: "19000000000000000" },
    watchlist: [],
  });
  appendDecision("red-team: would-revert, self-transfer above balance", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy?.allowed, true);
  // Self-transfer nets to zero regardless of amount, so effect verification
  // legitimately passes here, the balance question belongs to simulate.
  assert.equal(decision.effectVerification?.verdict, "match");
  assert.equal(decision.simulate?.wouldRevert, true);
  assert.equal(decision.execution, undefined);
});

test("frozen wallet: a standing delegation-integrity violation refuses the action immediately [no chain call]", async () => {
  // Represents a wallet the delegation monitor has already flagged, proven
  // live and separately in docs/RUNLOG.md (a real EIP-7702 re-delegation
  // detected and frozen). This isolates the gate's own handling of a frozen
  // guard, a real FreezeGuard implementation, not a mock of gate logic.
  const frozenGuard: FreezeGuard = {
    isFrozen: () => true,
    reason: () => "test: wallet delegation changed and has not been re-affirmed",
  };

  const decision = await buildGate([frozenGuard]).run({
    kind: "transfer",
    chainId: "84532",
    to: WALLET,
    valueEth: "0.0001",
    declaredEffect: { kind: "nativeTransfer", recipient: WALLET, amountWei: "100000000000000" },
    watchlist: [],
  });
  appendDecision("red-team: frozen wallet refuses immediately", decision);

  assert.equal(decision.allowed, false);
  assert.equal(decision.frozen, true);
  assert.equal(decision.policy, undefined, "blocked before policy runs");
  assert.equal(decision.effectVerification, undefined);
  assert.equal(decision.simulate, undefined);
  assert.equal(decision.execution, undefined);
});

test("honest positive: compliant self-transfer is allowed and lands [chain: lands a real tx]", async () => {
  const decision = await buildGate().run({
    kind: "transfer",
    chainId: "84532",
    to: WALLET,
    valueEth: "0.0001",
    declaredEffect: { kind: "nativeTransfer", recipient: WALLET, amountWei: "100000000000000" },
    watchlist: [],
  });
  appendDecision("red-team: honest positive, compliant self-transfer", decision);

  assert.equal(decision.allowed, true, decision.reason);
  assert.ok(decision.execution?.transactionHash, "expected a landed transaction hash");
});

test("honest positive: compliant USDC approve is allowed, lands, and the allowance is confirmed on-chain [chain: lands a real tx]", async () => {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET), new InvariantEngine(loadInvariantConfig(), WALLET));
  const amount = "3000000";

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [LAND_SPENDER, amount],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET,
      spender: LAND_SPENDER,
      allowanceBecomes: amount,
    },
    watchlist: [],
  });
  appendDecision("red-team: honest positive, compliant USDC approve", decision);

  assert.equal(decision.allowed, true, decision.reason);
  assert.ok(decision.execution?.transactionHash, "expected a landed transaction hash");

  const allowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET, LAND_SPENDER],
  });
  assert.equal(String(allowance), amount);
});
