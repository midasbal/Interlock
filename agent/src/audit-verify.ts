import { verifyChain } from "./auditTrail/chain.js";

const result = verifyChain();
console.log(JSON.stringify(result, null, 2));

if (!result.valid) {
  console.error(`chain broken at entry ${result.brokenAt}: ${result.reason}`);
  process.exitCode = 1;
} else {
  console.log(`chain valid: ${result.entryCount} entries, head ${result.chainHead}`);
}
