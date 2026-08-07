import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { appendDecision } from "./runlog.js";
import type { WatchedInvariant } from "../../policy/types.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// The declared intent claims this spender...
const DECLARED_SPENDER = "0x3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B3B";
// ...but the real encoded call below actually targets this different one.
// An honest declared-versus-actual discrepancy, not a malicious contract:
// both are plain demo addresses, the mismatch is entirely in which one the
// calldata really encodes versus what was declared.
const ACTUAL_SPENDER = "0x4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C4C";
const APPROVE_AMOUNT = "2000000"; // 2 USDC at 6 decimals

const WATCHLIST: WatchedInvariant[] = [
  {
    label: "USDC proxy admin slot",
    contractAddress: USDC_TOKEN,
    slot: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
  },
  {
    label: "wallet's other allowance (capability-3 test spender)",
    contractAddress: USDC_TOKEN,
    slot: "0x13bb65b878aea1dd23a17ec12c8d6ff8d1efa6940dea3a5659a7a353e35ab81d",
  },
];

/**
 * Case B: a caught mismatch. The proposed action's real functionArgs encode
 * approve(ACTUAL_SPENDER, amount), but declaredEffect claims the allowance
 * becomes that amount for DECLARED_SPENDER instead. Effect verification
 * applies the real call via a live state-diff trace, reads what actually
 * happened to allowance(owner, DECLARED_SPENDER), finds it never changed,
 * and blocks before signing.
 */
async function main() {
  const gate = new Gate(new KeeperHubRestClient(), new EffectVerifier(WALLET_ADDRESS));

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [ACTUAL_SPENDER, APPROVE_AMOUNT],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: DECLARED_SPENDER,
      allowanceBecomes: APPROVE_AMOUNT,
    },
    watchlist: WATCHLIST,
  });

  appendDecision("Case B, effect verification mismatch (declared spender != actual spender)", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (decision.allowed) {
    throw new Error("expected Case B to be blocked but the gate allowed it");
  }
  if (decision.effectVerification?.verdict !== "mismatch") {
    throw new Error("expected effect verification specifically to report a mismatch");
  }
  if (decision.simulate !== undefined) {
    throw new Error("expected simulate to be skipped, blocked at effect verification first");
  }
  if (decision.execution) {
    throw new Error("expected nothing to be executed, but an execution was recorded");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
