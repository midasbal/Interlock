import type { ExecutionStatus, TransferResult } from "./keeperhub/types.js";
import type { PolicyDecision, ProposedAction } from "../../policy/types.js";

export interface GateDecision {
  action: ProposedAction;
  timestamp: string;
  simulate: TransferResult;
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
