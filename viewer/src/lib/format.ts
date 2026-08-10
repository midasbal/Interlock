export function truncateHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function truncateAddress(value: string): string {
  return truncateHex(value, 6, 4);
}

export function truncateTxHash(value: string): string {
  return truncateHex(value, 10, 8);
}

export function weiToEth(wei: string): string {
  try {
    const value = BigInt(wei);
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const whole = abs / 10n ** 18n;
    const frac = (abs % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    const text = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
    return `${negative ? "-" : ""}${text} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").replace("Z", " UTC");
}

export function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(11, 19) + " UTC";
}

// Every real transaction hash in this trail is Base Sepolia (84532), the
// only chain this project executes on, confirmed in docs/KEEPERHUB.md.
export function explorerTxUrl(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://sepolia.basescan.org/address/${address}`;
}
