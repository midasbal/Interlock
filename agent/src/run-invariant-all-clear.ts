import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendNote } from "./detectorRunlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// Two of the three spenders configured in policy/invariants.json's
// allowanceExposure.monitoredSpenders, approved to a small amount each, so
// this genuinely exercises the aggregate-exposure check (both are counted)
// and still stays well clear of both the per-spender cap (3,000,000) and
// the aggregate cap (5,000,000), regardless of any prior on-chain state,
// since approve overwrites rather than adds.
const SPENDER_A = "0xC1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1C1";
const SPENDER_B = "0xD2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2D2";
const PER_APPROVAL_AMOUNT = "100000";

async function approve(client: KeeperHubRestClient, gate: Gate, label: string, spender: string) {
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

/**
 * The honest counterpart to the flagship breach: a sequence that stays
 * within every configured invariant throughout, and lands both times.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS), new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS));

  const first = await approve(client, gate, "all-clear approval 1 of 2, spender A", SPENDER_A);
  const second = await approve(client, gate, "all-clear approval 2 of 2, spender B", SPENDER_B);

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

  const allowanceA = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, SPENDER_A],
  });
  const allowanceB = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, SPENDER_B],
  });
  console.log(`confirmed allowances: A=${allowanceA} B=${allowanceB}`);
  if (String(allowanceA) !== PER_APPROVAL_AMOUNT || String(allowanceB) !== PER_APPROVAL_AMOUNT) {
    throw new Error(`expected confirmed allowance ${PER_APPROVAL_AMOUNT} for both spenders`);
  }

  appendNote(
    "2026-08-09: invariant all-clear sequence, real aggregate exposure under both caps",
    [
      `Spenders: A=${SPENDER_A}, B=${SPENDER_B}, per-approval amount ${PER_APPROVAL_AMOUNT}, per-spender cap 3000000, aggregate cap 5000000.`,
      `Approval 1 (A) landed: ${first.execution.transactionHash}, invariants passed.`,
      `Approval 2 (B) landed: ${second.execution.transactionHash}, invariants passed.`,
      `Confirmed on-chain allowances: A=${allowanceA}, B=${allowanceB}.`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
