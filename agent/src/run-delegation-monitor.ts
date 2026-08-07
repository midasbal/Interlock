import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { Gate } from "./gate.js";
import { EffectVerifier } from "./effectVerifier/verifier.js";
import { InvariantEngine } from "./invariants/engine.js";
import { loadInvariantConfig } from "./invariants/loadInvariantConfig.js";
import { appendDecision } from "./runlog.js";
import { appendDelegationMonitorEvent, appendNote } from "./delegationMonitorRunlog.js";
import { DelegationMonitor } from "./delegationMonitor/monitor.js";

// The motivating real case: KeeperHub's Turnkey wallet, delegated via a
// persistent EIP-7702 designator (see the Execution model section in
// docs/KEEPERHUB.md). Watched read-only, never manipulated.
const KEEPERHUB_WALLET = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";
const EXPECTED_KEEPERHUB_IMPLEMENTATION = "0x955d84139e7621bc571b117d8eb5d28a4a222c6f";

// The controllable case: a throwaway deployer EOA we hold the key for, used
// to prove the catch with a real re-delegation, confirmed feasible in Phase
// 0 with cast wallet sign-auth / cast send --auth on Base Sepolia.
const DEPLOYER_WALLET = "0x374929Ce9a5B1882A1e49BFCB7E72e0A65f24BB1";

const POLL_INTERVAL_MS = 4000;
const POLL_BUDGET = 25; // up to 100 seconds, bounded, not indefinite

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const keeperHubMonitor = new DelegationMonitor(KEEPERHUB_WALLET);
  const deployerMonitor = new DelegationMonitor(DEPLOYER_WALLET);

  const khBaseline = await keeperHubMonitor.pinBaseline();
  appendDelegationMonitorEvent("KeeperHub wallet (motivating case)", khBaseline);
  console.log(`KeeperHub wallet baseline: ${JSON.stringify(khBaseline)}`);
  if (
    khBaseline.kind !== "baseline-pinned" ||
    !khBaseline.state.delegated ||
    khBaseline.state.implementation !== EXPECTED_KEEPERHUB_IMPLEMENTATION
  ) {
    throw new Error(`KeeperHub wallet baseline did not match the expected delegation: ${JSON.stringify(khBaseline)}`);
  }

  const deployerBaseline = await deployerMonitor.pinBaseline();
  appendDelegationMonitorEvent("deployer EOA (controllable case)", deployerBaseline);
  console.log(`Deployer baseline: ${JSON.stringify(deployerBaseline)}`);

  console.log(
    `polling both wallets every ${POLL_INTERVAL_MS}ms, up to ${POLL_BUDGET} attempts, waiting for a real delegation change on the deployer...`
  );

  let violation: Awaited<ReturnType<typeof deployerMonitor.poll>> | null = null;

  for (let attempt = 1; attempt <= POLL_BUDGET; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const khEvent = await keeperHubMonitor.poll();
    appendDelegationMonitorEvent("KeeperHub wallet (motivating case)", khEvent);
    if (khEvent.kind !== "poll-clean") {
      throw new Error(
        `unexpected: the real KeeperHub wallet's delegation deviated during this run, that is either a false positive or a real event we did not cause: ${JSON.stringify(khEvent)}`
      );
    }
    console.log(`[${attempt}/${POLL_BUDGET}] KeeperHub wallet clean, implementation still ${khEvent.state.implementation}`);

    if (!violation) {
      const depEvent = await deployerMonitor.poll();
      appendDelegationMonitorEvent("deployer EOA (controllable case)", depEvent);

      if (depEvent.kind === "poll-clean") {
        console.log(`[${attempt}/${POLL_BUDGET}] deployer clean, implementation still ${depEvent.state.implementation}`);
      } else {
        violation = depEvent;
        console.log(`INTEGRITY VIOLATION on deployer at attempt ${attempt}: ${JSON.stringify(depEvent)}`);

        const gate = new Gate(
          new KeeperHubRestClient(),
          new EffectVerifier(DEPLOYER_WALLET),
          new InvariantEngine(loadInvariantConfig(), DEPLOYER_WALLET),
          undefined,
          [deployerMonitor]
        );
        const refusal = await gate.run({
          kind: "transfer",
          chainId: "84532",
          to: DEPLOYER_WALLET,
          valueEth: "0.0001",
          declaredEffect: {
            kind: "nativeTransfer",
            recipient: DEPLOYER_WALLET,
            amountWei: "100000000000000",
          },
          watchlist: [],
        });
        appendDecision("deployer wallet, action attempted after delegation integrity violation", refusal);
        console.log(`gate refusal after freeze: ${JSON.stringify(refusal)}`);

        if (refusal.allowed) {
          throw new Error("expected the gate to refuse this action once frozen, but it was allowed");
        }
        if (!refusal.frozen) {
          throw new Error("expected the decision to be marked frozen");
        }

        appendNote(
          "2026-08-08: delegation-integrity monitoring arc summary",
          [
            `KeeperHub wallet baseline: ${khBaseline.state.implementation}, watched clean for the full run, no false positive.`,
            `Deployer baseline: ${deployerBaseline.state.implementation}.`,
            `Integrity violation detected at poll attempt ${attempt}: deployer delegation changed from ${violation.kind === "integrity-violation" ? violation.baseline.implementation : "unknown"} to ${violation.kind === "integrity-violation" ? violation.observed.implementation : "unknown"}.`,
            `Gate refusal after freeze: allowed=${refusal.allowed}, frozen=${refusal.frozen}, reason="${refusal.reason}".`,
          ].join("\n")
        );
      }
    }
  }

  if (!violation) {
    throw new Error(`no delegation change detected on the deployer within the ${POLL_BUDGET}-attempt poll budget`);
  }

  console.log(
    "delegation-integrity monitoring arc complete: KeeperHub wallet watched clean throughout, deployer re-delegation detected and the gate froze."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
