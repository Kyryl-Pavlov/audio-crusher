import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const BYPASS_THRESHOLD_DB = -80;

/** Wraps the noise-gate AudioWorkletProcessor (registered once in EffectsGraph.create()). */
export class NoiseGateModule implements EffectModule {
  readonly type = "noise-gate" as const;
  readonly input: AudioWorkletNode;
  readonly output: AudioWorkletNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly node: AudioWorkletNode;
  private enabled = true;
  private thresholdDb = -40;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.node = new AudioWorkletNode(ctx, "noise-gate-processor");
    this.input = this.node;
    this.output = this.node;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    ramp(this.ctx, this.node.parameters.get("thresholdDb")!, enabled ? this.thresholdDb : BYPASS_THRESHOLD_DB);
  }

  setThreshold(db: number) {
    this.thresholdDb = db;
    if (this.enabled) ramp(this.ctx, this.node.parameters.get("thresholdDb")!, db);
  }

  setRelease(ms: number) {
    ramp(this.ctx, this.node.parameters.get("releaseMs")!, ms);
  }

  dispose() {
    this.node.disconnect();
  }
}
