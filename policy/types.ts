export interface ContractCallPolicy {
  targetAllowlist: string[];
  functionAllowlist: string[];
}

export interface Policy {
  chainAllowlist: string[];
  recipientAllowlist: string[];
  maxValueEth: string;
  contractCall: ContractCallPolicy;
}

export interface TransferAction {
  kind: "transfer";
  chainId: string;
  to: string;
  valueEth: string;
}

export interface ContractCallAction {
  kind: "contractCall";
  chainId: string;
  contractAddress: string;
  functionName: string;
  functionArgs: unknown[];
}

export type ProposedAction = TransferAction | ContractCallAction;

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}
