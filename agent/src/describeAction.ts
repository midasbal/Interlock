import type { ProposedAction } from "../../policy/types.js";

export function describeAction(action: ProposedAction): string {
  if (action.kind === "transfer") {
    return `transfer ${action.valueEth} ETH on chain ${action.chainId} to ${action.to}`;
  }
  return `call ${action.functionName}(${action.functionArgs.map(String).join(", ")}) on chain ${action.chainId} at contract ${action.contractAddress}`;
}
