const GIBIBYTE = 1_073_741_824;

export function screeningCheckpointInterval(
  barsLength: number,
  physicalMemoryBytes?: number,
): number {
  const memoryGiB =
    physicalMemoryBytes === undefined
      ? null
      : physicalMemoryBytes / GIBIBYTE;

  if (barsLength >= 6_000 || (memoryGiB !== null && memoryGiB <= 9)) {
    return 2_048;
  }
  if (barsLength >= 5_000 || (memoryGiB !== null && memoryGiB < 12)) {
    return 4_096;
  }
  if (barsLength >= 3_500 || (memoryGiB !== null && memoryGiB < 24)) {
    return 8_192;
  }
  return 16_384;
}
