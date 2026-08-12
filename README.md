# Interlock

A safety-gated execution layer for autonomous onchain agents, built on KeeperHub. Interlock works like a machine interlock: the signature stays locked until safety is proven.

## The problem

Agents are good at deciding what to do. The dangerous part is the last mile: actually signing and sending the transaction. A reverting tx, a bad approval, a wrong call, or a compromised dependency all cash out at the exact moment of execution, and most agent projects treat that moment as an afterthought. Interlock puts one ordered gate in front of every onchain action, whoever originates it, and nothing is signed until that gate clears.

Also entered for the Best Onboarding UX Improvement bounty. See the [Onboarding UX bounty](#onboarding-ux-bounty) section below and [BOUNTY.md](docs/BOUNTY.md).

## The gate model

Freeze is stage 0, the master interlock precondition, checked first, before anything else runs. If the wallet is clear, the action runs a five-stage pipeline: policy, effect verification, invariants, simulate, execute. Freeze-first, then a five-stage pipeline.

0. **Freeze.** A circuit breaker on the wallet itself, not on any one action. If a delegation-integrity monitor has detected an unexpected change to the wallet's own signing authority, the gate refuses everything until a human re-affirms. Freeze halts every action, revokes included: a freeze means the system is untrusted, so it emits nothing outbound.
1. **Policy.** Purely local, instant, no network call: chain allowlist, recipient or contract-call target allowlist, function allowlist, value cap.
2. **Effect verification.** Applies the exact proposed call via a live `debug_traceCall` state-diff trace against Base Sepolia, never broadcasting, and checks the real observed effect against what the caller declared it would be.
3. **Invariants.** Standing rules against the aggregated state (some read live from chain, one a real session-level running tally), independent of what any single action claims about itself.
4. **Simulate.** KeeperHub's own pre-flight check: would this revert.
5. **Execute**, only if every prior stage passed, then the full path is written to the audit trail.

This one gate is shared by both directions of the system, and every action, wherever it starts, lands in the same audit trail:

- **Inbound self-gate**: the agent's own proposed actions pass the gate before they can be signed, including catching a would-revert on simulate and adaptively retrying so the action still lands.
- **Outbound defense**: when a real onchain threat fires, Interlock originates a protective action itself, for example revoking a dangerous token approval, through the exact same gate. Urgency does not bypass anything.

## A real bug found along the way

Interlock's own post-execution reconciler independently detected a real, fund-affecting defect in KeeperHub's execution path, not a bug in Interlock: one authorized action was broadcast twice through two different execution paths (a sponsored relayer and a direct wallet send), and a separate execution was falsely reported as "failed" for a transaction that had actually succeeded on chain. Disclosed responsibly as [issue #1979](https://github.com/KeeperHub/keeperhub/issues/1979). KeeperHub confirmed it against production and merged the fix, [PR #1980](https://github.com/KeeperHub/keeperhub/pull/1980), "stop a sponsored send falling back into a second broadcast," the same day. Both sides get credit here: a safety layer stress-tested the execution layer it depends on, found a real bug, disclosed it responsibly, and the sponsor shipped a fix fast.

## The seven capabilities

Each capability below is real, proven with a real Base Sepolia transaction or artifact, and stated with its honest limit. Exact hashes and full request and response bodies are in `docs/RUNLOG.md`.

1. **The spine.** `agent/src/gate.ts` plus `policy/engine.ts`. A proposed action is checked against policy and simulated through KeeperHub, signed only if both pass, polled to on-chain confirmation. Proven with a real landed self-transfer (`npm run gate:case-a`, tx [`0x5e98e9a4b7f4f3acc2f680386a3d65f390f91ea5ec4c87fd587ac37041ae2dd8`](https://sepolia.basescan.org/tx/0x5e98e9a4b7f4f3acc2f680386a3d65f390f91ea5ec4c87fd587ac37041ae2dd8)) and a real policy block with nothing broadcast (`npm run gate:case-b`). Limit: at this layer alone, effect verification and invariants have not yet joined the gate, those are separate depth passes described below.
2. **Inbound self-gate.** `agent/src/selfGateAgent.ts`, a deterministic agent, no LLM, no paid runtime calls, that can only reach the chain through the gate. Bounded (max 3 attempt) adaptive retry: on an insufficient-balance would-revert it reduces the amount to the real confirmed balance and retries, on a policy block it stops immediately, on anything else unrecognized it stops rather than guessing. Proven live: a real would-revert caught by simulate, adapted, retried, and landed (`npm run agent:reliability-arc`, tx [`0x7ce9d27355f6c1548f05b78363fc060f5221acbb901acaff4a3b5ecbd2bab493`](https://sepolia.basescan.org/tx/0x7ce9d27355f6c1548f05b78363fc060f5221acbb901acaff4a3b5ecbd2bab493)), and a real policy block respected with nothing broadcast (`npm run agent:containment-case`). Limit: only adapts to the one recognized revert class, insufficient balance, anything else it stops on rather than guessing.
3. **Outbound approval-revoke.** `agent/src/run-outbound-approval-revoke.ts` plus `agent/src/detector/proxyImplementationDetector.ts`. A real EIP-1967 UUPS proxy (`0x5240E9f20788EA3A560C30D9d70C9eb1CDdd1CE2`) stands in for an approved spender. Real grant (tx [`0x491ed166bc57e17e6dfe617e2cf3bedd5c6f3d399ab68f5bef2385935d058131`](https://sepolia.basescan.org/tx/0x491ed166bc57e17e6dfe617e2cf3bedd5c6f3d399ab68f5bef2385935d058131)), a real `upgradeToAndCall` by the deployer to a distinct implementation (tx [`0x8bb4af8b111754c32cd75ff8a3402eb1b0975cfd465589b6c4d5899d4c5fd925`](https://sepolia.basescan.org/tx/0x8bb4af8b111754c32cd75ff8a3402eb1b0975cfd465589b6c4d5899d4c5fd925)), the detector observing the real slot change within its poll budget, the agent autonomously revoking through the gate (tx [`0x5d93ef3636beb488b39d1482a5fcae974203478e8f2b2626daa10027aee58d37`](https://sepolia.basescan.org/tx/0x5d93ef3636beb488b39d1482a5fcae974203478e8f2b2626daa10027aee58d37)), and the on-chain allowance independently confirmed back to zero. Limit: bounded polling means a real detection-latency window exists, not a mempool or block-by-block guarantee.
4. **Intent-versus-effect verification.** `agent/src/effectVerifier/verifier.ts`. Proven with a real honest match, landed with a confirmed on-chain effect (`npm run gate:effect-match`, tx [`0x75551cec70f87ae9b889a1c29b40993d9d38e83d113b1c3290a7e7ab64bd5ac5`](https://sepolia.basescan.org/tx/0x75551cec70f87ae9b889a1c29b40993d9d38e83d113b1c3290a7e7ab64bd5ac5)), and a genuine declared-versus-actual mismatch caught and blocked before simulate ever ran, nothing broadcast (`npm run gate:effect-mismatch`). Limit: verifies the exact call submitted to KeeperHub, cannot verify that KeeperHub's own sponsored, EIP-7702-delegated broadcast path faithfully reproduces that same call once wrapped, a stated trust assumption.
5. **Delegation-integrity monitoring with gate freeze.** `agent/src/delegationMonitor/monitor.ts` plus `agent/src/freezeGuard.ts`. A real second EIP-7702 authorization re-pointed the deployer's own delegation to a different implementation (tx [`0x49528b4ce4dafa9fb020d619cc005b5310a12f7c9fffd71f15b702bc2fea0432`](https://sepolia.basescan.org/tx/0x49528b4ce4dafa9fb020d619cc005b5310a12f7c9fffd71f15b702bc2fea0432), block 45180644), the monitor detected the real change within its poll budget, and a subsequent gate call from that wallet was refused with `frozen: true`. The real KeeperHub wallet's own standing delegation was watched read-only for the whole run with zero false positives (`npm run defense:delegation-monitor`). Limit: same bounded-polling detection-latency window as above, and it watches wallets chosen by configuration, it does not discover which ones to watch.
6. **Outcome-based invariants, with the policy digest anchored on-chain.** `agent/src/invariants/engine.ts`, `policy/invariants.json`. Real caps: a per-spender allowance cap of 3,000,000 and a real aggregate cap of 5,000,000 summed live across three monitored spenders. Proven: two approvals landed real under both caps, a third genuinely blocked purely by the aggregate check, independently confirmed real(A) + real(B) + proposed(C) equaled the blocked figure (`npm run invariant:flagship`, tx [`0x7a3fabdfda3a29ef0f90530e6ac312fdeac31ffcbe124baa0f7e358f80631d95`](https://sepolia.basescan.org/tx/0x7a3fabdfda3a29ef0f90530e6ac312fdeac31ffcbe124baa0f7e358f80631d95) and tx [`0x7c54d4b6e4fe1e5dea67c700294b06e95539302966f65a29a36c9e17506dc819`](https://sepolia.basescan.org/tx/0x7c54d4b6e4fe1e5dea67c700294b06e95539302966f65a29a36c9e17506dc819)), and a net-outflow bound of 0.001 ETH that genuinely blocked a third transfer (`npm run invariant:outflow`, transfer 1 tx [`0xdeebf74efecd0d3edd9718f7e135678067a4cde2f2cf2bc48515427bbba14161`](https://sepolia.basescan.org/tx/0xdeebf74efecd0d3edd9718f7e135678067a4cde2f2cf2bc48515427bbba14161), transfer 2 tx [`0x43fc655a6f535ad8e2864f958b262bc138ebf2b6721a0ce8258f5a80a9873046`](https://sepolia.basescan.org/tx/0x43fc655a6f535ad8e2864f958b262bc138ebf2b6721a0ce8258f5a80a9873046)). See "Two layers, one number" below for what that outflow demo turned up on reconciliation. The governing policy and invariant configuration is itself anchored on-chain (tx [`0xa49b61d4c72d599c08cf94796eaae53a383bd3a2fc8e712a579e50ecb48f3002`](https://sepolia.basescan.org/tx/0xa49b61d4c72d599c08cf94796eaae53a383bd3a2fc8e712a579e50ecb48f3002)). Limit: the net-outflow tally is process-local, not persisted across restarts, and the aggregate check only sums over a configured list of monitored spenders, an approval to a spender outside that list is not counted, by scope, not a flaw.
7. **Verifiable hash-chained audit trail, on-chain anchor, and post-execution reconciler.** Full mechanics below.

## Audit trail and reconciler

Every gate decision, agent run, detector event, and delegation-monitor event is written to `docs/RUNLOG.md` for humans and to `docs/audit-trail.jsonl` as a tamper-evident hash chain (`agent/src/auditTrail/chain.ts`). Each entry is `{seq, timestamp, type, payload, prevHash, hash}`, and `hash` covers the entry's own content plus the previous entry's hash, so altering, reordering, or deleting a past entry breaks the chain from that point forward. Anyone can independently recompute it from the raw file:

```
npm run audit:verify
```

This was confirmed live: a tampered copy of the chain was correctly flagged at the exact altered entry.

The chain's current head is also committed on-chain through the gate itself, `contracts/src/AuditAnchor.sol`'s `anchor(bytes32)`, on the original deploy at `0x0dDD39Da7c5f7DFe263cEE4866d1525895371E90` (anchor commit tx [`0x82078ba6695655539c933bfd866ce6f0dfc0fc242ebf803a0e8344b2c56da614`](https://sepolia.basescan.org/tx/0x82078ba6695655539c933bfd866ce6f0dfc0fc242ebf803a0e8344b2c56da614)), independently confirmed against the contract's own `lastDigest` read and its `Anchored` event log, not just the script's own claim. The contract was later extended with a keyed slot and redeployed at `0x174Aa8859aFFCFC0E8C8C30Ed320f95541D075f4`, whose `anchorKeyed(bytes32 key, bytes32 digest)` binds the governing `policy.json` and `invariants.json` to their own digest under a fixed key, independent of the audit-trail head, that is the anchor named in capability 6 above (tx [`0xa49b61d4c72d599c08cf94796eaae53a383bd3a2fc8e712a579e50ecb48f3002`](https://sepolia.basescan.org/tx/0xa49b61d4c72d599c08cf94796eaae53a383bd3a2fc8e712a579e50ecb48f3002)), confirmed against the contract's own `keyedDigest` read. Two contracts, two functions: `anchor()` on `0x0dDD3...` for the audit-trail head, `anchorKeyed()` on `0x174Aa...` for the policy configuration. **What either anchor proves: that the thing it committed, as it existed up to that anchor, has not been altered since.** Neither proves completeness, a never-recorded action or a later unanchored edit leaves no gap the chain or the digest itself can show, and neither covers anything written after its own anchor without a further anchor of its own.

`agent/src/reconciler/` is a separate, independent, after-the-fact check: for each authorized-and-executed decision it rebuilds a real Base Sepolia block-range search window from that decision's own recorded timestamps, scans it, and classifies every real transaction found against the action's declared effect using the same standard ABI encoders the effect verifier already uses, no transaction hash or address hardcoded anywhere in the matching logic. Run over the whole real project history:

```
npm run reconcile
```

It independently flagged a duplicate broadcast and a false status report from first principles, and surfaced two further real divergences a manual investigation had not caught. The report itself is appended to the same hash chain, `audit:verify` still passes with it included. A live mode reconciles a single gate call immediately after it lands (`npm run reconcile:live`, proven with a real honest self-transfer, tx [`0x47489b9f0cdc790a1ba1ad0a38b7d290ad88996e57c4f0b5ab3891e96bf695cd`](https://sepolia.basescan.org/tx/0x47489b9f0cdc790a1ba1ad0a38b7d290ad88996e57c4f0b5ab3891e96bf695cd)).

## Two layers, one number

Interlock's net-outflow invariant is an authorization bound. It caps what Interlock will authorize, and it refused transfer 3 at authorized-cumulative 0.0012 against the 0.001 cap. It does not claim to control what the execution layer actually broadcasts. When an authorized transfer was double-broadcast, real outflow exceeded the authorized tally, and Interlock's reconciler independently caught that divergence. Two questions, two layers: the invariant answers how much we authorized, the reconciler answers how much actually left. They agree unless execution misbehaves, and here it did.

The divergence itself, both landed on chain, same authorized transfer, same recipient, same amount: the authorized direct broadcast, tx [`0xdeebf74efecd0d3edd9718f7e135678067a4cde2f2cf2bc48515427bbba14161`](https://sepolia.basescan.org/tx/0xdeebf74efecd0d3edd9718f7e135678067a4cde2f2cf2bc48515427bbba14161) (block 45183495, direct from the wallet), and the wrapped duplicate, tx [`0x8a4c83e6d1fe031fbc627199e56eed6a38c860c5eced5fbcb6097b36a91f35b3`](https://sepolia.basescan.org/tx/0x8a4c83e6d1fe031fbc627199e56eed6a38c860c5eced5fbcb6097b36a91f35b3) (block 45183488, sponsored through KeeperHub's relayer). Both succeeded, both moved the same 0.0004 ETH to the same recipient, and only one of them was ever authorized.

No number in `docs/audit-trail.jsonl` or `policy/invariants.json` was changed to paper over this. The gap between the two numbers is the evidence, not a discrepancy to average away, and it is the same defect disclosed as issue #1979 above.

## Honest limits

Stated plainly, on purpose, this is the failure-mode thinking the project is built around, not a weakness to hide:

- **Trace-to-broadcast timing window.** Effect verification's trace is taken at the current chain head immediately before simulate and execute run, a small window exists where chain state could shift before the real broadcast.
- **Provider dependency.** `debug_traceCall` with `prestateTracer` availability is a property of the RPC provider, confirmed live on Base Sepolia's public endpoint, not a chain-level or provider-level guarantee elsewhere.
- **The sponsored-wrapper trust boundary.** Effect verification checks the direct effects of the exact call submitted to KeeperHub, it cannot verify that KeeperHub's own sponsored, EIP-7702-delegated broadcast path faithfully reproduces that call once wrapped. Trusting KeeperHub's sponsorship path means trusting its delegate implementation contract too, a stated assumption, not a hidden one.
- **The net-outflow tally is process-local**, held in memory for the lifetime of one process, not persisted across restarts, not a substitute for a cross-process ledger.
- **Aggregate-exposure scope.** Only sums over a configured list of monitored spenders. An approval to a spender outside that list is not counted toward the aggregate, by design, the point is watching a known set of relationships, not discovering them.
- **Delegation-monitor latency.** Bounded polling means a real window between a re-delegation landing and the next poll observing it, not a mempool-level or block-by-block guarantee.
- **The anchor proves non-alteration, not completeness.** See "Audit trail and reconciler" above.

## How it uses KeeperHub

KeeperHub is the execution and reliability layer underneath, the guarantees live there rather than in glue code. Interlock reaches it over MCP and uses direct execution with a simulate-first pattern: call with `simulate: true` first to get `success`, `wouldRevert`, and a gas estimate without broadcasting, then repeat the same call without `simulate` and with a fresh idempotency key, then poll `get_direct_execution_status` until the execution reaches `completed` or `failed`. The execution log this produces is treated as part of the audit trail, not a separate system. KeeperHub's own retry behavior, gas handling, and Turnkey-backed signing (a hardware-secure-enclave, non-custodial, hosted wallet) sit underneath every real transaction in this project, one org, one wallet, `0x4F6bE888cF5A55D9FaF2C9625BfA16AbF703c078`. Everything in this repository runs on Base Sepolia, chain id `84532`, at $0 real spend.

## How to verify

```
npm install
cp .env.example .env
# fill in KEEPERHUB_API_KEY and DEPLOYER_PRIVATE_KEY (a throwaway EOA, only needed
# for the delegation-monitor and outbound-defense proof scripts)
npm run typecheck
npm test
```

`npm test` runs the adversarial red-team suite (`agent/src/test/gate.redTeam.test.ts`, 8 cases against the real gate, no mocked gate logic) and the invariant property tests (`agent/src/test/invariants.property.test.ts`, 12 cases), all pass.

```
npm run audit:verify
```

recomputes the entire hash chain from `docs/audit-trail.jsonl` and reports the first broken link, if any. Every other capability above has its own real proof script (`npm run gate:case-a`, `gate:case-b`, `agent:reliability-arc`, `agent:containment-case`, `defense:approval-revoke`, `gate:effect-match`, `gate:effect-mismatch`, `defense:delegation-monitor`, `invariant:flagship`, `invariant:outflow`, `invariant:all-clear`, `reconcile`, `reconcile:live`, `audit:anchor`, `policy:anchor`), each one a real call against Base Sepolia. `docs/RUNLOG.md` has the full request and response for every transaction hash linked above.

External references: [issue #1979](https://github.com/KeeperHub/keeperhub/issues/1979), [PR #1980](https://github.com/KeeperHub/keeperhub/pull/1980).

## Onboarding UX bounty

During the build, kept a dated onboarding-friction teardown: seven reproducible issues on the real onboarding path (a self-contradicting action schema, field-name mismatches between the MCP and REST surfaces, an undocumented standing EIP-7702 delegation left on the wallet, and more), each with a concrete proposed fix. One reliability finding also came out of it, the double-broadcast plus false-status defect, disclosed as [issue #1979](https://github.com/KeeperHub/keeperhub/issues/1979) and fixed by KeeperHub in [PR #1980](https://github.com/KeeperHub/keeperhub/pull/1980). Full teardown in [BOUNTY.md](docs/BOUNTY.md).

## Stack

Solidity and Foundry for the testnet contracts, TypeScript and Node for the agent and policy engine, KeeperHub for execution, and a small viewer for the audit trail.

## Status

Not early. The safety-gated execution spine, both directions (inbound self-gate and outbound autonomous defense), intent-versus-effect verification, delegation-integrity monitoring with gate freeze, outcome-based invariants with the policy digest anchored on-chain, the hash-chained and on-chain-anchored audit trail, the post-execution reconciler, and an adversarial-plus-property-based test suite are all real, shipped, and proven on Base Sepolia with the transactions linked above, at $0 spend.

Roadmap: a second outbound trigger on a different real signal, and bundle-level gating across a multi-step sequence.

## License

MIT.
