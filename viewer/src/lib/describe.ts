import type { DeclaredEffect, ProposedAction } from "./types";

export function describeAction(action: ProposedAction): string {
  if (action.kind === "transfer") {
    return `Transfer ${action.valueEth} ETH on chain ${action.chainId}`;
  }
  return `Call ${action.functionName}(${action.functionArgs.map(String).join(", ")}) on chain ${action.chainId}`;
}

export function declaredEffectKindLabel(kind: DeclaredEffect["kind"]): string {
  switch (kind) {
    case "nativeTransfer":
      return "Native transfer";
    case "erc20Approve":
      return "ERC-20 approve";
    case "auditAnchor":
      return "Audit anchor";
    case "keyedAnchor":
      return "Keyed anchor";
  }
}

export function declaredEffectFields(effect: DeclaredEffect): Array<[string, string]> {
  switch (effect.kind) {
    case "nativeTransfer":
      return [
        ["recipient", effect.recipient],
        ["amountWei", effect.amountWei],
      ];
    case "erc20Approve":
      return [
        ["token", effect.token],
        ["owner", effect.owner],
        ["spender", effect.spender],
        ["allowanceBecomes", effect.allowanceBecomes],
      ];
    case "auditAnchor":
      return [
        ["contract", effect.contract],
        ["committer", effect.committer],
        ["digest", effect.digest],
      ];
    case "keyedAnchor":
      return [
        ["contract", effect.contract],
        ["committer", effect.committer],
        ["key", effect.key],
        ["digest", effect.digest],
      ];
  }
}
