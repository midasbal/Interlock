# Onboarding UX bounty submission

A dated onboarding-friction teardown produced during the build of Interlock, entered for KeeperHub's Best Onboarding UX Improvement bounty. It documents seven reproducible onboarding-friction findings, each with a concrete proposed fix, plus one reliability finding disclosed as [issue #1979](https://github.com/KeeperHub/keeperhub/issues/1979) and fixed by KeeperHub in [PR #1980](https://github.com/KeeperHub/keeperhub/pull/1980).

## Friction log

Dated entries, filled in from day zero of onboarding. Each entry states what was tried, what was expected, what actually happened, and how long it cost.

### 2026-08-07

#### Live-verification friction (first testnet execution)

**Friction 1: `list_action_schemas` tips claim `chainId` is canonical, but `web3/check-balance` only accepts `network`.**

- Trigger: building a minimal workflow with a `web3/check-balance` node, using the top-level `tips` array from `list_action_schemas`, which states "chainId is the canonical field for the target chain ... The legacy `network` field is still accepted as a deprecated alias."
- What a first-time builder sees: passing `chainId: "84532"` on a `web3/check-balance` node config fails workflow creation with a 422 `INVALID_ACTION_CONFIG`, `UNKNOWN_FIELD` on `chainId` and `MISSING_REQUIRED_FIELD` on `network`. The per-action schema for `web3/check-balance` (also returned by the same `list_action_schemas` call, under `actions`) does list `network` as the required field name, so the two parts of the same tool response disagree, and the global tip is wrong for at least this action.
- Proposed fix: either make `chainId` actually accepted on `web3/check-balance` (and any other action still requiring `network`), or scope the "chainId is canonical" tip to the specific action types it applies to instead of stating it as a blanket rule. The per-action `requiredFields` block was the source of truth here; the global tip cost an extra round trip.

**Friction 2: a simulate-caught revert on `execute_transfer` surfaces as a tool-call error, not a normal `success: false` result.**

- Trigger: calling `execute_transfer` with `simulate: true` and an amount larger than the wallet's balance (10 BASE against a 0.015 BASE balance on Base Sepolia), specifically to exercise the pre-flight revert catch.
- What a first-time builder sees: the MCP tool call itself fails with an HTTP 400 and throws, rather than returning a normal 200 response body with `wouldRevert: true`. The revert detail (`wouldRevert: true`, `revertReason`, `code: "insufficient_balance"`, `shortfallWei`, etc.) is all there, just embedded in the thrown error's payload instead of a successful tool result. The tools_documentation text says "any tool error is a hard stop", which reads as "treat every thrown error the same way", but a caught-would-revert on simulate is a normal, expected outcome the caller needs to branch on, not a hard stop. A caller following the docs literally would need to catch and parse the error body to tell "the preflight worked as intended" apart from "the API call itself is broken."
- Proposed fix: return simulate-with-revert results as a normal 200 response with `success: false, wouldRevert: true, ...`, or explicitly document that a would-revert simulate is expected to come back as a structured error and show how to distinguish it from a genuine failure (e.g. by the presence of `wouldRevert` and `revertReason` fields in the error payload).

#### Spine slice 1 friction (execution model, REST API)

**Friction 3: `simulate` reports gas for a plain transfer, not for the sponsored EIP-7702 execution actually broadcast.**

- Trigger: comparing the `execute_transfer` simulate result (`gasEstimate: "21000"`) for a native self-transfer against the real gas used once broadcast (`gasUsed: "74769"`), then inspecting the landed transaction on sepolia.basescan.org.
- What a first-time builder sees: KeeperHub broadcasts sponsored transfers as EIP-7702 (type 4) transactions wrapped in an `execute()` router call, paid for by a relayer address, not as a plain EOA-to-EOA transfer. 21,000 gas is the textbook cost of a bare transfer and has no relationship to the actual wrapped, sponsored call that ends up on-chain, so the simulate step under-reports gas by roughly 3.5x for this path. Nothing in the tool description or `tools_documentation` flags that simulate's gas estimate reflects the plain inner action rather than the real sponsored execution.
- Proposed fix: document that the `simulate` gas estimate is for the logical action, not the on-chain sponsored wrapper, and either surface an estimate closer to the real broadcast cost or explicitly warn callers not to use it for gas budgeting on sponsored chains.

**Friction 4: REST API field names differ from MCP tool parameter names for the same action.**

- Trigger: confirming the REST API shape for `execute_transfer` at docs.keeperhub.com to build a standalone TypeScript client outside the MCP session.
- What a first-time builder sees: the MCP tool `execute_transfer` takes `chain_id` and `to_address`, but the equivalent REST endpoint `POST /api/execute/transfer` takes `chainId` and `recipientAddress` for the same fields. A builder who prototypes against the MCP tool and then ports the same request body to the REST API gets silent 422s or missing-field errors unless they notice the naming convention (snake_case vs camelCase) and the field rename are both different.
- Proposed fix: either align the field names between the MCP tool schema and the REST API, or add a note in both surfaces' docs cross-referencing the other's field names for the same action.

**Friction 5: sponsored writes leave a persistent EIP-7702 delegation on the user's wallet, and this is not documented anywhere in KeeperHub's docs or tool descriptions.**

- Trigger: confirming whether the EIP-7702 delegation seen on a sponsored `execute_transfer` call is scoped to that one transaction or left standing, by calling `eth_getCode` directly against the wallet address on the Base Sepolia RPC after the transaction, and cross-checking against sepolia.basescan.org.
- What a first-time builder sees: the delegation is standing account state (`eth_getCode` returns the `0xef0100` designator plus the implementation address, and basescan shows a persistent "Authority - Delegated to" badge on the address itself), not something scoped to a single sponsored call. Nothing in `tools_documentation`, the tool descriptions, or the docs.keeperhub.com pages fetched during this project mentions that a wallet gains a standing EIP-7702 delegation the first time it is used for a sponsored write, or explains what that means: the wallet now permanently executes under the delegate implementation's code for every future transaction, sponsored or not, until a later authorization changes or clears it. This has a real security dimension, a wallet believed to be a plain EOA is in fact bound to whatever logic lives at the delegate implementation, that a first-time builder has no way to learn from KeeperHub's own docs.
- Proposed fix: document, in the wallet or execution section of the docs, that a Turnkey wallet's first sponsored write leaves a persistent EIP-7702 delegation in place, name the delegate implementation contract, and state plainly what that means for anyone relying on the wallet's code being empty (an EOA) afterward.

#### Capability 3 phase A friction (contract-call gating)

**Friction 6: a contract-call write's immediate response omits the transaction hash that a transfer write's immediate response includes.**

- Trigger: calling `POST /api/execute/contract-call` (and the equivalent `execute_contract_call` MCP tool) for a real `approve` write, right after confirming `POST /api/execute/transfer` returns `{ executionId, status, transactionHash, transactionLink }` immediately, even when `status` is already `"completed"`.
- What a first-time builder sees: the contract-call write's immediate response is only `{ executionId: "...", status: "completed" }`, no `transactionHash`, no `transactionLink`, even though the call has, in fact, already landed on-chain. The transaction hash only shows up after separately polling `get_direct_execution_status` (or `GET /api/execute/{executionId}/status`) and reading it from there. A caller that reasonably assumes both direct-execution write endpoints return the same immediate shape, since `tools_documentation`'s "safe first-write pattern" describes them together with identical steps, gets a landed transaction with no hash to show for it until they add a poll step the docs never flagged as mandatory for this endpoint specifically.
- Proposed fix: either include `transactionHash`/`transactionLink` in the contract-call write's immediate response once the transaction is confirmed, matching the transfer endpoint, or state explicitly in the docs that only the transfer endpoint's immediate response carries the hash and that contract-call callers must always poll for it.

#### Audit-trail hardening friction

**Friction 7: `execute_contract_call` / `POST /api/execute/contract-call` silently requires a manual ABI for any contract not verified on the block explorer, with no signpost until the call already fails.**

- Trigger: calling `execute_contract_call` for `AuditAnchor`, a small contract deployed for this project and not submitted for verification on Basescan, without passing an `abi` field, relying on the documented "ABI auto-fetched for verified contracts if omitted" behavior that had worked for every previously-used contract (Circle's USDC, the capability-3 proxy) because they all happened to be verified.
- What a first-time builder sees: the call fails with a 400 and `"ABI is required. Could not auto-fetch ABI ... Contract may not be verified."` only at call time, after everything else (policy, effect verification, simulate wiring) is already built and working. Nothing in `tools_documentation`, the tool description, or the docs pages flags that auto-fetch is contingent on block-explorer verification specifically, or that a fresh, unverified contract (the common case right after `forge create`) needs the caller to pass its own ABI from day one.
- Proposed fix: state plainly, next to the `abi` field's description, that auto-fetch depends on the contract being verified on the relevant block explorer, and that a newly deployed, unverified contract (the typical case for a project's own contracts) always needs an explicit ABI.

#### Reliability finding, not onboarding friction

**Reliability finding: a single idempotency-keyed execute call is sometimes broadcast twice through two different execution paths, and the execution KeeperHub itself was tracking is sometimes falsely reported as failed. Confirmed as a recurring pattern, not a one-off, by the post-execution reconciler.**

- Trigger: investigating an extra 0.0004 ETH transfer to a demo recipient with no matching entry in the project's own audit trail. Later confirmed as a recurring pattern by running `agent/src/reconciler` over the whole project history.
- Findings: one gate decision, one execute call, one fresh idempotency key, authorized exactly once. Direct RPC reads against Base Sepolia show the same authorized transfer landed on-chain twice, once as a sponsored call from KeeperHub's own relayer through its router, and once as a non-sponsored transaction sent directly from the wallet, both moving the same 0.0004 ETH to the same recipient, seconds apart. Separately, the execution KeeperHub itself was tracking for this call (the non-sponsored one) was reported as `"status": "failed"`, `"receiptStatus": "not_found"`, because KeeperHub checked for the receipt one second before the transaction was actually mined and never rechecked, even though the transaction had, in fact, succeeded. Neither bug surfaced in `retryCount`, which stayed 0.
- The reconciler found this is not isolated to that one transfer. Running it over the entire project history turned up two further real, independent occurrences: a second false "failed" status on an unrelated, earlier, honest self-transfer (transaction `0xbf2014efa887d48232c61841f11b54b6e082d0a38960bf9d78f9e959cff641e7`, reported failed, receipt not found, chain shows it succeeded), and a second genuine duplicate broadcast, this time on a contract call rather than a transfer: an `anchorKeyed` call authorized once landed on-chain twice, once sponsored through the relayer (`0x72a49a076236265df322f7b0d95ef04607832c5268856837fb178213ed613b1c`, block 45182849) and once direct from the wallet (`0xb408b7a96256558fb8d03055d358570419183b0b3ff657726c1cf149e00dfbed`, block 45182856), seven blocks apart, same relayer, same pattern, and in this instance KeeperHub's reported status for the tracked transaction happened to be correct. Duplicate broadcast and the false-failed status are two separate bugs that can occur independently or together.
- Proposed fix: honor a supplied idempotency key across every internal execution path a single request can take, sponsored and non-sponsored alike, for both transfers and contract calls, so one authorized action cannot land on-chain twice; and retry a not-yet-found receipt before reporting an execution as failed, rather than treating a premature check as terminal.
