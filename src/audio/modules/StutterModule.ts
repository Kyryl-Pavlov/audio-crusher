import type { EffectModule } from "./types";

/**
 * Wraps the granular-stutter AudioWorkletProcessor (registered once in
 * EffectsGraph.create()). `active` is a boolean trigger read by the processor's
 * script logic (not an audio-rate multiplier), so it's snapped rather than ramped.
 */
export class StutterModule implements EffectModule {
  readonly type = "stutter" as const;
  readonly input: AudioWorkletNode;
  readonly output: AudioWorkletNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly node: AudioWorkletNode;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.node = new AudioWorkletNode(ctx, "stutter-processor");
    this.input = this.node;
    this.output = this.node;
  }

  setEnabled(active: boolean) {
    const now = this.ctx.currentTime;
    const param = this.node.parameters.get("active")!;
    param.cancelScheduledValues(now);
    param.setValueAtTime(active ? 1 : 0, now);
  }

  setWindow(ms: number) {
    const now = this.ctx.currentTime;
    const param = this.node.parameters.get("windowMs")!;
    param.cancelScheduledValues(now);
    param.setValueAtTime(ms, now);
  }

  dispose() {
    this.node.disconnect();
  }
}
