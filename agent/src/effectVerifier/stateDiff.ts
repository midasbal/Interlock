import { rpcCall } from "../rpc/baseSepolia.js";

export interface StateDiffAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}

export interface StateDiffResult {
  pre: Record<string, StateDiffAccount>;
  post: Record<string, StateDiffAccount>;
}

export interface CallParams {
  from: string;
  to: string;
  data?: string;
  value?: string;
}

/**
 * A full generic state diff for a proposed call, applied at the current
 * chain head but never broadcast. Confirmed live on 2026-08-08 that Base
 * Sepolia's public RPC supports debug_traceCall with prestateTracer in
 * diffMode directly, no local fork needed, see docs/ARCHITECTURE.md for the
 * method choice and its honest limits.
 */
export async function traceCallStateDiff(call: CallParams): Promise<StateDiffResult> {
  return rpcCall<StateDiffResult>("debug_traceCall", [
    call,
    "latest",
    { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
  ]);
}

/**
 * Reads a contract's view function as if the given storage diff had already
 * been applied, via eth_call's stateDiff override. This lets the verifier
 * read the resulting value through the contract's own function (e.g.
 * allowance) instead of hand-computing mapping storage slots.
 */
export async function readWithStateOverride(
  call: CallParams,
  overrideAddress: string,
  storageDiff: Record<string, string>
): Promise<string> {
  return rpcCall<string>("eth_call", [
    call,
    "latest",
    { [overrideAddress]: { stateDiff: storageDiff } },
  ]);
}
