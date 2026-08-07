export interface TransferRequest {
  chainId: string;
  toAddress: string;
  amount: string;
  tokenAddress?: string;
  idempotencyKey?: string;
  simulate?: boolean;
}

export interface ContractCallRequest {
  chainId: string;
  contractAddress: string;
  functionName: string;
  functionArgs: unknown[];
  value?: string;
  idempotencyKey?: string;
  simulate?: boolean;
}

/**
 * Shared shape for both a native transfer and a contract call, confirmed
 * identical live for both endpoints on 2026-08-08, see docs/KEEPERHUB.md.
 */
export interface ExecutionResult {
  success: boolean;
  wouldRevert?: boolean;
  gasEstimate?: string;
  revertReason?: string;
  simulatedReturnValue?: unknown;
  executionId?: string;
  status?: string;
  transactionHash?: string;
  transactionLink?: string;
}

export type TransferResult = ExecutionResult;
export type ContractCallResult = ExecutionResult;

export interface ReadContractRequest {
  chainId: string;
  contractAddress: string;
  functionName: string;
  functionArgs: unknown[];
}

export interface ExecutionStatus {
  executionId: string;
  status: "running" | "completed" | "failed" | string;
  transactionHash?: string;
  transactionLink?: string;
  receipts?: Array<{
    hash: string;
    chainId: number;
    gasUsed: string;
    verified: boolean;
    blockNumber: number;
    receiptStatus: string;
  }>;
  error?: string | null;
}

export interface KeeperHubClient {
  simulateTransfer(request: TransferRequest): Promise<TransferResult>;
  executeTransfer(request: TransferRequest): Promise<TransferResult>;
  simulateContractCall(request: ContractCallRequest): Promise<ContractCallResult>;
  executeContractCall(request: ContractCallRequest): Promise<ContractCallResult>;
  readContract(request: ReadContractRequest): Promise<unknown>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
}
