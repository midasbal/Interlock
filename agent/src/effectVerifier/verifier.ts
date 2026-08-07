import { rpcCall } from "../rpc/baseSepolia.js";
import { decodeUint256, encodeAllowanceCalldata, encodeApproveCalldata } from "./abiEncoding.js";
import { readWithStateOverride, traceCallStateDiff, type StateDiffResult } from "./stateDiff.js";
import { ethStringToWei } from "./units.js";
import type { DeclaredEffect, ProposedAction, WatchedInvariant } from "../../../policy/types.js";

export interface EffectVerificationResult {
  verdict: "match" | "mismatch";
  declared: DeclaredEffect;
  observed: Record<string, string>;
  deviations: string[];
}

function balanceDelta(
  pre: { balance?: string } | undefined,
  post: { balance?: string } | undefined
): bigint {
  const preBalance = pre?.balance ? BigInt(pre.balance) : 0n;
  const postBalance = post?.balance ? BigInt(post.balance) : preBalance;
  return postBalance - preBalance;
}

/**
 * Verifies a proposed action's real, direct effects against its declared
 * intent before the gate will let it be signed. Method and honest limits are
 * documented in docs/ARCHITECTURE.md: this checks the direct effects of the
 * exact call submitted to KeeperHub, applied but never broadcast, via a live
 * debug_traceCall state diff against the current chain head. It does not,
 * and cannot, verify KeeperHub's own sponsored delegate wrapping faithfully
 * reproduces this same call, that remains a stated trust assumption.
 */
export class EffectVerifier {
  constructor(private readonly walletAddress: string) {}

  async verify(action: ProposedAction): Promise<EffectVerificationResult> {
    const declared = action.declaredEffect;
    const deviations: string[] = [];
    const observed: Record<string, string> = {};

    const watchBefore = await this.readWatchlist(action.watchlist);

    if (declared.kind === "nativeTransfer" && action.kind === "transfer") {
      const diff = await traceCallStateDiff({
        from: this.walletAddress,
        to: action.to,
        value: `0x${ethStringToWei(action.valueEth).toString(16)}`,
      });

      const walletKey = this.walletAddress.toLowerCase();
      const recipientKey = declared.recipient.toLowerCase();
      const isSelfTransfer = walletKey === recipientKey;

      const senderDelta = balanceDelta(diff.pre[walletKey], diff.post[walletKey]);
      const recipientDelta = isSelfTransfer
        ? senderDelta
        : balanceDelta(diff.pre[recipientKey], diff.post[recipientKey]);
      observed.senderDeltaWei = senderDelta.toString();
      observed.recipientDeltaWei = recipientDelta.toString();

      const declaredAmount = BigInt(declared.amountWei);
      if (isSelfTransfer) {
        // Sender and recipient are the same account: the honest declared
        // effect is a net-zero balance change, not "-v then +v" on the same
        // number, which would be a contradiction, not a real deviation.
        if (senderDelta !== 0n) {
          deviations.push(
            `self-transfer changed net balance by ${senderDelta} wei, expected no net change`
          );
        }
      } else {
        if (recipientDelta !== declaredAmount) {
          deviations.push(
            `recipient balance changed by ${recipientDelta} wei, declared effect said +${declaredAmount} wei`
          );
        }
        if (senderDelta !== -declaredAmount) {
          deviations.push(
            `sender balance changed by ${senderDelta} wei, declared effect said -${declaredAmount} wei`
          );
        }
      }

      this.checkUndeclaredAccounts(diff, [walletKey, recipientKey], deviations);
      this.checkWatchlist(action.watchlist, watchBefore, diff, deviations);

      return { verdict: deviations.length === 0 ? "match" : "mismatch", declared, observed, deviations };
    }

    if (declared.kind === "erc20Approve" && action.kind === "contractCall") {
      if (action.functionName !== "approve") {
        throw new Error(`erc20Approve declared effect requires functionName "approve", got "${action.functionName}"`);
      }
      const [actualSpender, actualAmount] = action.functionArgs as [string, string];
      const callData = encodeApproveCalldata(actualSpender, actualAmount);

      const diff = await traceCallStateDiff({
        from: this.walletAddress,
        to: action.contractAddress,
        data: callData,
      });

      const tokenKey = declared.token.toLowerCase();
      const storageDiff = diff.post[tokenKey]?.storage ?? {};

      const afterHex = await readWithStateOverride(
        {
          from: this.walletAddress,
          to: declared.token,
          data: encodeAllowanceCalldata(declared.owner, declared.spender),
        },
        declared.token,
        storageDiff
      );
      const afterValue = decodeUint256(afterHex);
      observed.allowanceAfter = afterValue.toString();

      const declaredAmount = BigInt(declared.allowanceBecomes);
      if (afterValue !== declaredAmount) {
        deviations.push(
          `allowance(${declared.owner}, ${declared.spender}) on ${declared.token} became ${afterValue}, declared effect said it becomes ${declaredAmount}`
        );
      }

      this.checkUndeclaredAccounts(diff, [tokenKey, this.walletAddress.toLowerCase()], deviations);
      this.checkWatchlist(action.watchlist, watchBefore, diff, deviations);

      return { verdict: deviations.length === 0 ? "match" : "mismatch", declared, observed, deviations };
    }

    throw new Error(`declared effect kind "${declared.kind}" does not match action kind "${action.kind}"`);
  }

  private async readWatchlist(watchlist: WatchedInvariant[]): Promise<Record<string, string>> {
    const before: Record<string, string> = {};
    for (const item of watchlist) {
      before[item.label] = await rpcCall<string>("eth_getStorageAt", [
        item.contractAddress,
        item.slot,
        "latest",
      ]);
    }
    return before;
  }

  private checkUndeclaredAccounts(
    diff: StateDiffResult,
    expectedKeys: string[],
    deviations: string[]
  ): void {
    const expected = new Set(expectedKeys.map((key) => key.toLowerCase()));
    for (const address of Object.keys(diff.post)) {
      if (!expected.has(address.toLowerCase())) {
        deviations.push(`undeclared account or contract changed: ${address}`);
      }
    }
  }

  private checkWatchlist(
    watchlist: WatchedInvariant[],
    before: Record<string, string>,
    diff: StateDiffResult,
    deviations: string[]
  ): void {
    for (const item of watchlist) {
      const account = diff.post[item.contractAddress.toLowerCase()];
      const changedValue = account?.storage?.[item.slot.toLowerCase()] ?? account?.storage?.[item.slot];
      if (changedValue !== undefined && changedValue.toLowerCase() !== before[item.label].toLowerCase()) {
        deviations.push(
          `watched invariant "${item.label}" changed: ${before[item.label]} -> ${changedValue}`
        );
      }
    }
  }
}
