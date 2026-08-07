import { rpcCall } from "../rpc/baseSepolia.js";

// EIP-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/**
 * A plain public JSON-RPC read, no KeeperHub client, no key, no signing.
 * Confirmed live on 2026-08-08 by direct curl calls before this module was
 * written, see docs/RUNLOG.md.
 */
export async function readImplementationSlot(proxyAddress: string): Promise<string> {
  const result = await rpcCall<string>("eth_getStorageAt", [
    proxyAddress,
    EIP1967_IMPLEMENTATION_SLOT,
    "latest",
  ]);
  return slotValueToAddress(result);
}

function slotValueToAddress(slotValue: string): string {
  const hex = slotValue.slice(2).padStart(64, "0");
  return `0x${hex.slice(24)}`;
}
