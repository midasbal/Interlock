import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const TEST_SPENDER = "0x1234567890123456789012345678901234567890";

/**
 * approve(spender, 0) is the exact primitive the outbound approval-revoke
 * defense will use. Run after run-token-approve.ts so there is a real
 * nonzero allowance to revoke.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(
    client,
    new EffectVerifier(WALLET_ADDRESS),
    new InvariantEngine(loadInvariantConfig(), WALLET_ADDRESS)
  );

  const decision = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [TEST_SPENDER, "0"],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: TEST_SPENDER,
      allowanceBecomes: "0",
    },
    watchlist: [],
  });

  appendDecision("token approve (revoke to zero), USDC via gate", decision);

  if (!decision.allowed) {
    throw new Error(`expected the revoke to be allowed but the gate blocked it: ${decision.reason}`);
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

  if (String(allowance) !== "0") {
    throw new Error(`expected confirmed allowance 0 but read ${String(allowance)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
