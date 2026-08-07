import type { ExecutionResult, ExecutionStatus } from "./keeperhub/types.js";
import type { PolicyDecision, ProposedAction } from "../../policy/types.js";

export interface GateDecision {
  action: ProposedAction;
  timestamp: string;
  simulate: ExecutionResult;
  policy: PolicyDecision;
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
