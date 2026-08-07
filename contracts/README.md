# contracts

Testnet Solidity contracts for Interlock. Deployed to a public testnet (Sepolia by default) so that both the inbound gate and the outbound defense triggers have real, observable onchain state to act on.

Expected to eventually hold: a protected vault, a token with approvals, and an upgradeable spender contract we control, used to make the proxy-change trigger real. Nothing is built yet, this run only creates the folder.
