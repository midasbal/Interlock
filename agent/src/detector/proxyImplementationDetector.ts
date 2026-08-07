import { readImplementationSlot } from "./implementationSlot.js";

export type BaselinePinnedEvent = { kind: "baseline-pinned"; timestamp: string; implementation: string };
export type PollCleanEvent = { kind: "poll-clean"; timestamp: string; implementation: string };
export type ThreatDetectedEvent = {
  kind: "threat-detected";
  timestamp: string;
  baseline: string;
  observed: string;
};

export type DetectorEvent = BaselinePinnedEvent | PollCleanEvent | ThreatDetectedEvent;
export type PollEvent = PollCleanEvent | ThreatDetectedEvent;

/**
 * Watches one proxy's EIP-1967 implementation slot on a bounded polling
 * interval. The only thing that can classify a change as a threat is an
 * actual observed slot value differing from the pinned baseline, there is no
 * timer or manual trigger standing in for detection.
 */
export class ProxyImplementationDetector {
  private baseline: string | null = null;

  constructor(private readonly proxyAddress: string) {}

  async pinBaseline(): Promise<BaselinePinnedEvent> {
    const implementation = await readImplementationSlot(this.proxyAddress);
    this.baseline = implementation;
    return {
      kind: "baseline-pinned",
      timestamp: new Date().toISOString(),
      implementation,
    };
  }

  async poll(): Promise<PollEvent> {
    if (!this.baseline) {
      throw new Error("cannot poll before a baseline is pinned");
    }
    const implementation = await readImplementationSlot(this.proxyAddress);
    const timestamp = new Date().toISOString();

    if (implementation.toLowerCase() !== this.baseline.toLowerCase()) {
      return {
        kind: "threat-detected",
        timestamp,
        baseline: this.baseline,
        observed: implementation,
      };
    }
    return { kind: "poll-clean", timestamp, implementation };
  }
}
