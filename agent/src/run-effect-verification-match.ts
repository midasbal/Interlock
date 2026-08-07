import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { appendDecision } from "./runlog.js";
import type { WatchedInvariant } from "../../policy/types.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// A demo spender for this proof only, not a real protocol.
const CASE_A_SPENDER = "0x2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A";
const APPROVE_AMOUNT = "2000000"; // 2 USDC at 6 decimals

// Sensitive invariants that must not change as a side effect of this call,
// see docs/ARCHITECTURE.md. Both confirmed live before this script was
// written: the USDC proxy's admin slot (classic zos AdminUpgradeabilityProxy
// pattern, keccak256("org.zeppelinos.proxy.admin")), and the wallet's
// existing allowance to the capability-3 test spender, an "other allowance"
// that this approve call has no business touching.
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
 * Case A: an honest match. Declared intent and the real encoded call agree,
 * so effect verification, policy, and simulate all pass and it lands.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS));

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [CASE_A_SPENDER, APPROVE_AMOUNT],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: CASE_A_SPENDER,
      allowanceBecomes: APPROVE_AMOUNT,
    },
    watchlist: WATCHLIST,
  });

  appendDecision("Case A, effect verification honest match", decision);

  if (!decision.allowed) {
    throw new Error(`expected Case A to be allowed but the gate blocked it: ${decision.reason}`);
  }
  if (decision.effectVerification?.verdict !== "match") {
    throw new Error("expected effect verification to report a match");
  }
  if (!decision.execution?.transactionHash) {
    throw new Error("expected a landed transaction hash but none was recorded");
  }

  const allowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, CASE_A_SPENDER],
  });

  console.log(JSON.stringify({ decision, confirmedAllowance: allowance }, null, 2));

  if (String(allowance) !== APPROVE_AMOUNT) {
    throw new Error(`expected confirmed allowance ${APPROVE_AMOUNT} but read ${String(allowance)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
