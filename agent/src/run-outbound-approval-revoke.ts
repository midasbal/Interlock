import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { appendDecision } from "./runlog.js";
import { appendDetectorEvent, appendNote } from "./detectorRunlog.js";
import { ProxyImplementationDetector } from "./detector/proxyImplementationDetector.js";

const USDC_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const SPENDER_PROXY = "0x5240E9f20788EA3A560C30D9d70C9eb1CDdd1CE2";
const GRANT_AMOUNT = "1000000"; // 1 USDC at 6 decimals

const POLL_INTERVAL_MS = 3000;
const POLL_BUDGET = 60; // up to 3 minutes, bounded, not indefinite

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const client = new KeeperHubRestClient();
  const gate = new Gate(client, new EffectVerifier(WALLET_ADDRESS));

  console.log("granting USDC approval to the spender proxy through the gate...");
  const grant = await gate.run({
    kind: "contractCall",
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "approve",
    functionArgs: [SPENDER_PROXY, GRANT_AMOUNT],
    declaredEffect: {
      kind: "erc20Approve",
      token: USDC_TOKEN,
      owner: WALLET_ADDRESS,
      spender: SPENDER_PROXY,
      allowanceBecomes: GRANT_AMOUNT,
    },
    watchlist: [],
  });
  appendDecision("outbound defense stage, grant USDC approval to spender proxy", grant);
  if (!grant.allowed) {
    throw new Error(`grant was blocked, cannot continue: ${grant.reason}`);
  }
  const grantAllowance = await client.readContract({
    chainId: "84532",
    contractAddress: USDC_TOKEN,
    functionName: "allowance",
    functionArgs: [WALLET_ADDRESS, SPENDER_PROXY],
  });
  console.log(`grant landed: ${grant.execution?.transactionHash}, confirmed allowance: ${grantAllowance}`);
  if (String(grantAllowance) !== GRANT_AMOUNT) {
    throw new Error(`expected confirmed allowance ${GRANT_AMOUNT} but read ${String(grantAllowance)}`);
  }

  const detector = new ProxyImplementationDetector(SPENDER_PROXY);
  const baseline = await detector.pinBaseline();
  appendDetectorEvent("outbound defense stage", baseline);
  console.log(`baseline pinned: ${JSON.stringify(baseline)}`);
  console.log(
    `polling every ${POLL_INTERVAL_MS}ms, up to ${POLL_BUDGET} attempts, waiting for a real implementation-slot change...`
  );

  for (let attempt = 1; attempt <= POLL_BUDGET; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const event = await detector.poll();

    if (event.kind === "poll-clean") {
      console.log(`[${attempt}/${POLL_BUDGET}] clean, implementation still ${event.implementation}`);
      continue;
    }

    // threat-detected
    appendDetectorEvent("outbound defense stage", event);
    console.log(`THREAT DETECTED at attempt ${attempt}: ${JSON.stringify(event)}`);

    const revoke = await gate.run({
      kind: "contractCall",
      chainId: "84532",
      contractAddress: USDC_TOKEN,
      functionName: "approve",
      functionArgs: [SPENDER_PROXY, "0"],
      declaredEffect: {
        kind: "erc20Approve",
        token: USDC_TOKEN,
        owner: WALLET_ADDRESS,
        spender: SPENDER_PROXY,
        allowanceBecomes: "0",
      },
      watchlist: [],
    });
    appendDecision("outbound defense stage, autonomous revoke on detected implementation change", revoke);

    if (!revoke.allowed) {
      throw new Error(`revoke was blocked, this should never happen for an approve(spender, 0) call: ${revoke.reason}`);
    }

    const revokeAllowance = await client.readContract({
      chainId: "84532",
      contractAddress: USDC_TOKEN,
      functionName: "allowance",
      functionArgs: [WALLET_ADDRESS, SPENDER_PROXY],
    });
    console.log(`revoke landed: ${revoke.execution?.transactionHash}, confirmed allowance: ${revokeAllowance}`);

    appendNote(
      "2026-08-08: outbound defense arc summary",
      [
        `Grant tx: ${grant.execution?.transactionHash}, confirmed allowance ${grantAllowance}.`,
        `Baseline implementation: ${baseline.kind === "baseline-pinned" ? baseline.implementation : "unknown"}.`,
        `Threat detected at poll attempt ${attempt}: implementation changed from ${event.baseline} to ${event.observed}.`,
        `Revoke tx: ${revoke.execution?.transactionHash}, confirmed allowance ${revokeAllowance}.`,
      ].join("\n")
    );

    if (String(revokeAllowance) !== "0") {
      throw new Error(`expected confirmed allowance 0 after revoke but read ${String(revokeAllowance)}`);
    }

    console.log("outbound defense arc complete: grant, detect, revoke, confirmed zero allowance.");
    return;
  }

  throw new Error(`no implementation change detected within the ${POLL_BUDGET}-attempt poll budget`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
