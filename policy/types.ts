export interface Policy {
  chainAllowlist: string[];
  recipientAllowlist: string[];
  maxValueEth: string;
}

export interface ProposedAction {
  chainId: string;
  to: string;
  valueEth: string;
  data?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}
