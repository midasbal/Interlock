import { KeeperHubRestClient } from "./keeperhub/restClient.js";
import { reconcileHistory } from "./reconciler/reconciler.js";
import { appendReconciliationReport } from "./reconcilerRunlog.js";

const WALLET_ADDRESS = "0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078";

/**
 * Post-execution reconciliation over the whole project history: for every
 * authorized-and-executed gate decision, independently rebuild what landed
 * on chain and cross-check it against what KeeperHub itself currently
 * reports for that execution. Motivated by the real divergence found
 * 2026-08-08, see docs/RUNLOG.md.
 */
async function main() {
  const client = new KeeperHubRestClient();
  const report = await reconcileHistory(client, WALLET_ADDRESS);

  console.log(`${report.itemCount} authorized-and-executed decisions checked`);
  console.log(`${report.reconciledCount} reconciled cleanly`);
  console.log(`${report.divergentCount} flagged`);

  for (const item of report.items) {
    if (item.divergences.length === 0) {
      continue;
    }
    console.log(`\nseq ${item.seq} (${item.label}): ${item.verdict}`);
    for (const divergence of item.divergences) {
      console.log(`  - ${divergence.type}: ${divergence.detail}`);
    }
  }

  appendReconciliationReport(report);
  console.log("\nreport appended to docs/audit-trail.jsonl and docs/RUNLOG.md");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
