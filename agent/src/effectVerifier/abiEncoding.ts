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

export function encodeBytes32(value: string): string {
  return padLeft(value);
}

// anchor(bytes32) selector, confirmed live with cast sig, keccak256("anchor(bytes32)")[:4]
export function encodeAnchorCalldata(digest: string): string {
  return `0xeecdf927${encodeBytes32(digest)}`;
}

// lastDigest(address) selector, confirmed live with cast sig, keccak256("lastDigest(address)")[:4]
export function encodeLastDigestCalldata(committer: string): string {
  return `0x8dd8c307${encodeAddress(committer)}`;
}

// anchorKeyed(bytes32,bytes32) selector, confirmed live with cast sig, keccak256("anchorKeyed(bytes32,bytes32)")[:4]
export function encodeAnchorKeyedCalldata(key: string, digest: string): string {
  return `0xe03dc897${encodeBytes32(key)}${encodeBytes32(digest)}`;
}

// keyedDigest(address,bytes32) selector, confirmed live with cast sig, keccak256("keyedDigest(address,bytes32)")[:4]
export function encodeKeyedDigestCalldata(committer: string, key: string): string {
  return `0x108ba06f${encodeAddress(committer)}${encodeBytes32(key)}`;
}
