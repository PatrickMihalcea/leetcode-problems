/** Rounds a max value up to a clean axis bound and returns an even tick step (~4 ticks). */
export function niceMax(maxValue: number, tickCount = 4): { max: number; step: number } {
  if (maxValue <= 0) return { max: tickCount, step: 1 };
  const roughStep = maxValue / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceResidual: number;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  const step = niceResidual * magnitude;
  const max = Math.ceil(maxValue / step) * step;
  return { max, step };
}
