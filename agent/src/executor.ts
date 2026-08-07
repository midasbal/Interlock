import type { ProposedAction } from "../../policy/types.js";
import type { GateDecision } from "./types.js";

/**
 * The only interface the self-gate agent is allowed to depend on. It carries
 * no reference to the KeeperHub client, credentials, or any signing path,
 * only a proposed action in and a structured decision out. The gate is the
 * sole implementation, and the sole executor.
 */
export interface Executor {
  run(action: ProposedAction): Promise<GateDecision>;
}
