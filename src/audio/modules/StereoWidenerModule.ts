import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Mid/side stereo widening: splits L/R, derives mid=(L+R)/2 and side=(L-R)/2, scales
 * the side signal by `width`, then recombines L'=mid+width*side, R'=mid-width*side.
 * At width=1 this reconstructs the original signal exactly (no enable toggle needed).
 */
export class StereoWidenerModule implements EffectModule {
  readonly type = "stereo-widener" as const;
  readonly input: GainNode;
  readonly output: ChannelMergerNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly widthGain: GainNode;
  private readonly nodes: AudioNode[];

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();

    const splitter = ctx.createChannelSplitter(2);
    this.input.connect(splitter);

    const midL = ctx.createGain();
    midL.gain.value = 0.5;
    const midR = ctx.createGain();
    midR.gain.value = 0.5;
    const mid = ctx.createGain();
    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    midL.connect(mid);
    midR.connect(mid);

    const sideL = ctx.createGain();
    sideL.gain.value = 0.5;
    const sideR = ctx.createGain();
    sideR.gain.value = -0.5;
    const side = ctx.createGain();
    splitter.connect(sideL, 0);
    splitter.connect(sideR, 1);
    sideL.connect(side);
    sideR.connect(side);

    this.widthGain = ctx.createGain();
    this.widthGain.gain.value = 1;
    side.connect(this.widthGain);

    const sideInvert = ctx.createGain();
    sideInvert.gain.value = -1;
    this.widthGain.connect(sideInvert);

    const merger = ctx.createChannelMerger(2);
    mid.connect(merger, 0, 0);
    this.widthGain.connect(merger, 0, 0);
    mid.connect(merger, 0, 1);
    sideInvert.connect(merger, 0, 1);
    this.output = merger;

    this.nodes = [splitter, midL, midR, mid, sideL, sideR, side, this.widthGain, sideInvert, merger];
  }

  setWidth(width: number) {
    ramp(this.ctx, this.widthGain.gain, width);
  }

  dispose() {
    this.input.disconnect();
    this.nodes.forEach((n) => n.disconnect());
  }
}
