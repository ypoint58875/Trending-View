export function dailyDirectionBlocks(bars, startDate = "2000-01-04", blockSize = 200) {
  if (!Number.isInteger(blockSize) || blockSize < 1) throw new Error("Block size must be a positive integer");
  const first = bars.findIndex((b) => b.date >= startDate);
  if (first < 1) throw new Error("A preceding close is required for the first included trading day");
  const rows = [];
  for (let start = first; start < bars.length; start += blockSize) {
    const end = Math.min(start + blockSize, bars.length);
    let up = 0, down = 0, flat = 0;
    for (let i = start; i < end; i++) {
      const sign = Math.sign(bars[i].close - bars[i - 1].close);
      if (sign > 0) up++; else if (sign < 0) down++; else flat++;
    }
    const sessions = end - start;
    rows.push({ block: rows.length + 1, firstSession: start - first + 1, lastSession: end - first,
      startDate: bars[start].date, endDate: bars[end - 1].date, sessions, complete: sessions === blockSize,
      upDays: up, downDays: down, flatDays: flat,
      upPct: up / sessions * 100, downPct: down / sessions * 100, flatPct: flat / sessions * 100 });
  }
  return rows;
}
