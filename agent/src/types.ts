import type { ExecutionResult, ExecutionStatus } from "./keeperhub/types.js";
import type { PolicyDecision, ProposedAction } from "../../policy/types.js";
import type { EffectVerificationResult } from "./effectVerifier/verifier.js";
import type { InvariantEvaluation } from "./invariants/engine.js";

/**
 * policy, effectVerification, invariants, and simulate are optional because
 * the gate blocks as early as possible: a delegation freeze check runs
 * first, then policy, then effect verification, then invariants, then
 * simulate, and a block at an earlier stage means later stages never run.
 */
export interface GateDecision {
  action: ProposedAction;
  timestamp: string;
  frozen?: boolean;
  policy?: PolicyDecision;
  effectVerification?: EffectVerificationResult;
  invariants?: InvariantEvaluation;
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
