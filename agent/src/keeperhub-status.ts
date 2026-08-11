import { KeeperHubRestClient } from "./keeperhub/restClient.js";

/**
 * Read-only lookup against KeeperHub's own get_direct_execution_status
 * endpoint (GET /api/execute/{executionId}/status), for showing KeeperHub
 * confirming its own execution on camera. Never touches the audit trail,
 * never prints KEEPERHUB_API_KEY, only sends it as the Authorization header
 * on the outgoing request via KeeperHubRestClient.
 */
async function main() {
  const executionId = process.argv[2];
  if (!executionId) {
    console.error("usage: npm run keeperhub:status -- <executionId>");
    process.exitCode = 1;
    return;
  }

  const client = new KeeperHubRestClient();
  const status = await client.getExecutionStatus(executionId);

  console.log(`execution id: ${status.executionId}`);
  console.log(`status: ${status.status}`);
  console.log(`transaction hash: ${status.transactionHash ?? "none"}`);
  if (status.error) {
    console.log(`error: ${status.error}`);
  }
  if (status.receipts && status.receipts.length > 0) {
    console.log("receipts:");
    for (const receipt of status.receipts) {
      console.log(
        `  ${receipt.hash}: chain ${receipt.chainId}, block ${receipt.blockNumber}, receipt status ${receipt.receiptStatus}, verified=${receipt.verified}, gas used ${receipt.gasUsed}`
      );
    }
  } else {
    console.log("receipts: none");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
