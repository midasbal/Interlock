import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { appendDecision } from "./runlog.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

async function main() {
  const gate = new Gate(new KeeperHubRestClient());

  const decision = await gate.run({
    chainId: "84532",
    to: WALLET_ADDRESS,
    valueEth: "0.0001",
  });

  appendDecision("Case A, compliant self-transfer", decision);
  console.log(JSON.stringify(decision, null, 2));

  if (!decision.allowed) {
    throw new Error("Case A was expected to be allowed but the gate blocked it");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
