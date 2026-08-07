import type {
  ContractCallRequest,
  ContractCallResult,
  ExecutionStatus,
  KeeperHubClient,
  ReadContractRequest,
  TransferRequest,
  TransferResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://app.keeperhub.com/api/";

interface RestClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Confirmed live against docs.keeperhub.com and by direct curl calls on
 * 2026-08-07 and 2026-08-08, see docs/KEEPERHUB.md. A would-revert simulate
 * comes back as a non-2xx response with the revert detail in the body, not
 * as a normal success:false 200 (see the friction entry in docs/BOUNTY.md),
 * so both paths are handled here for both transfers and contract calls.
 */
export class KeeperHubRestClient implements KeeperHubClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: RestClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.KEEPERHUB_API_KEY;
    if (!apiKey) {
      throw new Error(
        "KEEPERHUB_API_KEY is not set. Add it to .env (see .env.example)."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async simulateTransfer(request: TransferRequest): Promise<TransferResult> {
    return this.postJson("execute/transfer", {
      chainId: request.chainId,
      recipientAddress: request.toAddress,
      amount: request.amount,
      tokenAddress: request.tokenAddress,
      simulate: true,
    });
  }

  async executeTransfer(request: TransferRequest): Promise<TransferResult> {
    return this.postJson(
      "execute/transfer",
      {
        chainId: request.chainId,
        recipientAddress: request.toAddress,
        amount: request.amount,
        tokenAddress: request.tokenAddress,
      },
      request.idempotencyKey
    );
  }

  async simulateContractCall(request: ContractCallRequest): Promise<ContractCallResult> {
    return this.postJson("execute/contract-call", {
      chainId: request.chainId,
      contractAddress: request.contractAddress,
      functionName: request.functionName,
      functionArgs: JSON.stringify(request.functionArgs),
      value: request.value,
      simulate: true,
    });
  }

  async executeContractCall(request: ContractCallRequest): Promise<ContractCallResult> {
    return this.postJson(
      "execute/contract-call",
      {
        chainId: request.chainId,
        contractAddress: request.contractAddress,
        functionName: request.functionName,
        functionArgs: JSON.stringify(request.functionArgs),
        value: request.value,
      },
      request.idempotencyKey
    );
  }

  async readContract(request: ReadContractRequest): Promise<unknown> {
    const body = await this.postJson<{ result?: unknown }>("execute/contract-call", {
      chainId: request.chainId,
      contractAddress: request.contractAddress,
      functionName: request.functionName,
      functionArgs: JSON.stringify(request.functionArgs),
    });
    return body.result;
  }

  async getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
    const response = await fetch(
      `${this.baseUrl}execute/${executionId}/status`,
      { headers: this.headers() }
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        `getExecutionStatus failed (${response.status}): ${JSON.stringify(body)}`
      );
    }
    return body as ExecutionStatus;
  }

  private async postJson<T>(
    path: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<T> {
    const headers = this.headers();
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as T;

    // A caught would-revert on simulate arrives as a non-2xx response with the
    // revert detail in the body. That is a normal, expected outcome, not a
    // transport failure, so it is returned rather than thrown.
    if (!response.ok && typeof (body as { wouldRevert?: unknown }).wouldRevert === "boolean") {
      return body;
    }
    if (!response.ok) {
      throw new Error(
        `KeeperHub request to ${path} failed (${response.status}): ${JSON.stringify(body)}`
      );
    }
    return body;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
