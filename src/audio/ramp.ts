// Glide time for automated AudioParam changes triggered by UI input, so slider drags
// and toggles don't produce audible zipper noise/clicks.
export const PARAM_GLIDE_SECONDS = 0.015;

export function ramp(ctx: BaseAudioContext, param: AudioParam, value: number) {
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, PARAM_GLIDE_SECONDS);
}
