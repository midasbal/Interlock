# agent

The agent runtime. Owns the safety-gated execution spine: simulate, then policy check, then sign through KeeperHub, then write to the audit trail. Both the inbound self-gate and the outbound defense flows run through this code.

Nothing is built yet, this run only creates the folder.
