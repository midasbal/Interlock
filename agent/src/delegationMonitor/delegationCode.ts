import { rpcCall } from "../rpc/baseSepolia.js";

// EIP-7702 delegation designator prefix, EIP-7702.
export const DELEGATION_PREFIX = "0xef0100";

export interface DelegationState {
  delegated: boolean;
  implementation: string | null;
  rawCode: string;
}

/**
 * A plain public eth_getCode read, no KeeperHub client, no key, no signing.
 * Confirmed live on 2026-08-08, see docs/RUNLOG.md.
 */
export async function readDelegationState(address: string): Promise<DelegationState> {
  const rawCode = await rpcCall<string>("eth_getCode", [address, "latest"]);
  const normalized = rawCode.toLowerCase();
  if (normalized.startsWith(DELEGATION_PREFIX)) {
    return {
      delegated: true,
      implementation: `0x${normalized.slice(DELEGATION_PREFIX.length)}`,
      rawCode,
    };
  }
  return { delegated: false, implementation: null, rawCode };
}
