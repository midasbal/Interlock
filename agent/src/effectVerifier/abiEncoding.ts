function padLeft(hex: string, bytes = 32): string {
  return hex.replace(/^0x/i, "").padStart(bytes * 2, "0");
}

export function encodeAddress(address: string): string {
  return padLeft(address.toLowerCase());
}

export function encodeUint256(value: string | bigint): string {
  return padLeft(BigInt(value).toString(16));
}

// approve(address,uint256) selector, standard ERC-20, keccak256("approve(address,uint256)")[:4]
export function encodeApproveCalldata(spender: string, amount: string): string {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

// allowance(address,address) selector, standard ERC-20, keccak256("allowance(address,address)")[:4]
export function encodeAllowanceCalldata(owner: string, spender: string): string {
  return `0xdd62ed3e${encodeAddress(owner)}${encodeAddress(spender)}`;
}

export function decodeUint256(hex: string): bigint {
  return BigInt(hex);
}
