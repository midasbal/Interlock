import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { appendDecision } from "./runlog.js";

// Circle's official USDC on Base Sepolia, confirmed live on 2026-08-08 by
// eth_getCode, symbol(), decimals(), and allowance() calls, see
// docs/RUNLOG.md. In the policy contractCall.targetAllowlist.
const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

// A recorded test spender, not a real protocol, chosen only to exercise
// approve/revoke through the gate.
const TEST_SPENDER = "0x1234567890123456789012345678901234567890";
const APPROVE_AMOUNT = "1000000"; // 1 USDC at 6 decimals

async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS));

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [TEST_SPENDER, APPROVE_AMOUNT],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: TEST_SPENDER,
      allowanceBecomes: APPROVE_AMOUNT,
    },
    watchlist: [],
  });

  appendDecision("token approve (grant), USDC via gate", decision);

  if (!decision.allowed) {
    throw new Error(`expected the grant to be allowed but the gate blocked it: ${decision.reason}`);
  }
  if (!decision.execution?.transactionHash) {
    throw new Error("expected a landed transaction hash but none was recorded");
  }

  const allowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, TEST_SPENDER],
  });

  console.log(JSON.stringify({ decision, confirmedAllowance: allowance }, null, 2));

  if (String(allowance) !== APPROVE_AMOUNT) {
    throw new Error(
      `expected confirmed allowance ${APPROVE_AMOUNT} but read ${String(allowance)}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
