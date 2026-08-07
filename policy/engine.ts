import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Policy, PolicyDecision, ProposedAction } from "./types.js";

const DEFAULT_POLICY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "policy.json"
);

export function loadPolicy(path: string = DEFAULT_POLICY_PATH): Policy {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Policy;
}

export function evaluate(action: ProposedAction, policy: Policy): PolicyDecision {
  if (!policy.chainAllowlist.includes(action.chainId)) {
    return {
      allowed: false,
      reason: `chain ${action.chainId} is not in the chain allowlist [${policy.chainAllowlist.join(", ")}]`,
    };
  }

  if (action.kind === "transfer") {
    const recipientAllowed = policy.recipientAllowlist.some(
      (address) => address.toLowerCase() === action.to.toLowerCase()
    );
    if (!recipientAllowed) {
      return {
        allowed: false,
        reason: `recipient ${action.to} is not in the recipient allowlist`,
      };
    }

    const value = Number(action.valueEth);
    const maxValue = Number(policy.maxValueEth);
    if (Number.isNaN(value)) {
      return { allowed: false, reason: `valueEth "${action.valueEth}" is not a valid number` };
    }
    if (value > maxValue) {
      return {
        allowed: false,
        reason: `value ${action.valueEth} ETH exceeds the policy cap of ${policy.maxValueEth} ETH`,
      };
    }

    return { allowed: true, reason: "action passes chain, recipient, and value-cap policy" };
  }

  // action.kind === "contractCall"
  const targetAllowed = policy.contractCall.targetAllowlist.some(
    (address) => address.toLowerCase() === action.contractAddress.toLowerCase()
  );
  if (!targetAllowed) {
    return {
      allowed: false,
      reason: `contract ${action.contractAddress} is not in the contract-call target allowlist`,
    };
  }

  if (!policy.contractCall.functionAllowlist.includes(action.functionName)) {
    return {
      allowed: false,
      reason: `function "${action.functionName}" is not in the contract-call function allowlist [${policy.contractCall.functionAllowlist.join(", ")}]`,
    };
  }

  return { allowed: true, reason: "action passes chain, target-contract, and function-allowlist policy" };
}
