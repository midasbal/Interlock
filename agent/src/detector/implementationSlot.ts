const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// EIP-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/**
 * A plain public JSON-RPC read, no KeeperHub client, no key, no signing.
 * Confirmed live on 2026-08-08 by direct curl calls before this module was
 * written, see docs/RUNLOG.md.
 */
export async function readImplementationSlot(proxyAddress: string): Promise<string> {
  const response = await fetch(BASE_SEPOLIA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getStorageAt",
      params: [proxyAddress, EIP1967_IMPLEMENTATION_SLOT, "latest"],
    }),
  });
  const body = (await response.json()) as { result?: string; error?: unknown };
  if (body.error || !body.result) {
    throw new Error(`eth_getStorageAt failed: ${JSON.stringify(body.error)}`);
  }
  return slotValueToAddress(body.result);
}

function slotValueToAddress(slotValue: string): string {
  const hex = slotValue.slice(2).padStart(64, "0");
  return `0x${hex.slice(24)}`;
}
