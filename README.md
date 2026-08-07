# Interlock

A safety-gated execution layer for autonomous onchain agents, built on KeeperHub.

## The problem

Agents are good at deciding what to do. The dangerous part is the last mile: actually signing and sending the transaction. A reverting tx, a bad approval, a wrong call, or a compromised dependency all cash out at the exact moment of execution, and most agent projects treat that moment as an afterthought.

## What Interlock does

Interlock puts one gate in front of every onchain action, whoever originates it. Before anything is signed it:

1. Simulates the transaction to catch a revert and estimate gas, without broadcasting.
2. Checks it against a declarative policy (recipient and function allowlists, value and spend caps, unexpected state-change checks).
3. Signs only if it passes.
4. Writes the full path (trigger, simulation, submitted tx, gas, outcome, timestamp) to a verifiable audit trail.

That spine runs in two directions:

- Inbound self-gate: the agent's own actions pass the gate before they can be signed, including catching a would-revert and retrying so the action lands.
- Outbound defense: when a real onchain threat fires, Interlock originates a protective action through the same gate, for example revoking a dangerous token approval.

## How it uses KeeperHub

KeeperHub is the execution and reliability layer underneath. Interlock reaches it over MCP and uses direct execution with a simulate-first pattern (simulate, then execute with an idempotency key, then poll for status), the execution log as the audit trail, and KeeperHub's retry, gas handling, and Turnkey-backed signing so the guarantees live in the execution layer rather than in glue code. Everything runs on a testnet.

## Architecture

One shared spine, simulate then policy then sign then audit, sits between an agent's intent and the chain. Two things feed into it: the agent's own proposed actions (inbound), and protective actions Interlock originates itself when a real threat is detected onchain (outbound). Both paths go through the exact same gate and land in the exact same audit trail. A proper diagram can come later, this is the short version.

## Status

Early. Anything listed as working is really working, no mocks.

## Getting started

TODO(human): filled in as the first components land.

## Demo

TODO(human): demo video and a link to a transaction executed via KeeperHub.

## Stack

Solidity and Foundry for the testnet contracts, TypeScript and Node for the agent and policy engine, KeeperHub for execution, and a small viewer for the audit trail.

## License

MIT.
