export function linkedVolumeForTotal(total: number, changedVolume: number): number {
  return Math.min(1, Math.max(0, total - changedVolume));
}
