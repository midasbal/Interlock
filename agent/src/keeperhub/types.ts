export interface TransferRequest {
  chainId: string;
  toAddress: string;
  amount: string;
  tokenAddress?: string;
  idempotencyKey?: string;
  simulate?: boolean;
}

export interface TransferResult {
  success: boolean;
  wouldRevert?: boolean;
  gasEstimate?: string;
  revertReason?: string;
  executionId?: string;
  status?: string;
  transactionHash?: string;
  transactionLink?: string;
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
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
}
