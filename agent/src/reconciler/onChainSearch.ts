import { rpcCall } from "../rpc/baseSepolia.js";

export interface OnChainTx {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: string;
  blockNumber: number;
  timestamp: number;
}

interface RawTx {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: string;
}

interface RawBlock {
  timestamp: string;
  transactions: RawTx[];
}

interface RawReceipt {
  status: string;
  blockNumber: string;
}

const blockTimestampCache = new Map<number, number>();
const blockTxCache = new Map<number, OnChainTx[]>();

function toHexBlockTag(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}

export async function latestBlockNumber(): Promise<number> {
  const hex = await rpcCall<string>("eth_blockNumber", []);
  return parseInt(hex, 16);
}

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  const cached = blockTimestampCache.get(blockNumber);
  if (cached !== undefined) {
    return cached;
  }
  const block = await rpcCall<{ timestamp: string } | null>("eth_getBlockByNumber", [
    toHexBlockTag(blockNumber),
    false,
  ]);
  if (!block) {
    throw new Error(`block ${blockNumber} not found, chain may not have reached it yet`);
  }
  const timestamp = parseInt(block.timestamp, 16);
  blockTimestampCache.set(blockNumber, timestamp);
  return timestamp;
}

/**
 * Smallest block number whose timestamp is at or after targetUnixSeconds,
 * found by binary search over live timestamps. No block time is assumed or
 * hardcoded, the answer comes entirely from real chain reads.
 */
export async function blockAtOrAfter(targetUnixSeconds: number, latest: number): Promise<number> {
  let lo = 1;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const timestamp = await getBlockTimestamp(mid);
    if (timestamp >= targetUnixSeconds) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

export async function getBlockTransactions(blockNumber: number): Promise<OnChainTx[]> {
  const cached = blockTxCache.get(blockNumber);
  if (cached) {
    return cached;
  }
  const block = await rpcCall<RawBlock | null>("eth_getBlockByNumber", [toHexBlockTag(blockNumber), true]);
  if (!block) {
    blockTxCache.set(blockNumber, []);
    return [];
  }
  const timestamp = parseInt(block.timestamp, 16);
  blockTimestampCache.set(blockNumber, timestamp);
  const txs: OnChainTx[] = block.transactions.map((tx) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    input: tx.input,
    value: tx.value,
    blockNumber,
    timestamp,
  }));
  blockTxCache.set(blockNumber, txs);
  return txs;
}

/** Every transaction in [fromBlock, toBlock], inclusive. Reused across nearby windows via the shared block cache. */
export async function getTransactionsInRange(fromBlock: number, toBlock: number): Promise<OnChainTx[]> {
  const all: OnChainTx[] = [];
  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
    all.push(...(await getBlockTransactions(blockNumber)));
  }
  return all;
}

export interface OnChainReceiptStatus {
  found: boolean;
  status?: "success" | "reverted";
  blockNumber?: number;
}

export async function getReceiptStatus(hash: string): Promise<OnChainReceiptStatus> {
  const receipt = await rpcCall<RawReceipt | null>("eth_getTransactionReceipt", [hash]);
  if (!receipt) {
    return { found: false };
  }
  return {
    found: true,
    status: receipt.status === "0x1" ? "success" : "reverted",
    blockNumber: parseInt(receipt.blockNumber, 16),
  };
}
