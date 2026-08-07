import type { ExecutionResult, ExecutionStatus } from "./keeperhub/types.js";
import type { PolicyDecision, ProposedAction } from "../../policy/types.js";
import type { EffectVerificationResult } from "./effectVerifier/verifier.js";

/**
 * simulate and effectVerification are optional because the gate blocks as
 * early as possible: policy runs first, then effect verification, then
 * simulate, and a block at an earlier stage means later stages never run.
 */
export interface GateDecision {
  action: ProposedAction;
  timestamp: string;
  policy: PolicyDecision;
  effectVerification?: EffectVerificationResult;
  simulate?: ExecutionResult;
  allowed: boolean;
  reason: string;
  execution?: {
    executionId: string;
    status: string;
    transactionHash?: string;
    transactionLink?: string;
  };
  finalStatus?: ExecutionStatus;
}
