import assert from "node:assert/strict";
import test from "node:test";
import { applyDataZoomWindow } from "../app/components/EChart";
import { buildPriceDataZoom } from "../app/components/PriceChart";

type ZoomEntry = {
  id?: string;
  type?: string;
  xAxisIndex?: number[];
  start?: number;
  end?: number;
  height?: number;
  handleSize?: string | number;
  brushSelect?: boolean;
  realtime?: boolean;
  zoomLock?: boolean;
};

function entries(barsLength: number, overlayIndicator: boolean) {
  return buildPriceDataZoom(
    barsLength,
    overlayIndicator,
  ) as ZoomEntry[];
}

test("makes the selected price-chart zoom window directly draggable", () => {
  const dataZoom = entries(1_000, false);
  const slider = dataZoom.find((entry) => entry.type === "slider");

  assert.ok(slider);
  assert.equal(slider.id, "price-zoom-slider");
  assert.equal(slider.brushSelect, false);
  assert.equal(slider.realtime, true);
  assert.equal(slider.zoomLock, false);
  assert.equal(slider.height, 22);
  assert.equal(slider.handleSize, "125%");
  assert.deepEqual(slider.xAxisIndex, [0, 1, 2]);
});

test("links price zoom across visible grids and starts with recent bars", () => {
  const oscillatorZoom = entries(1_000, false);
  const overlayZoom = entries(1_000, true);

  for (const entry of oscillatorZoom) {
    assert.equal(entry.start, 88);
    assert.equal(entry.end, 100);
    assert.deepEqual(entry.xAxisIndex, [0, 1, 2]);
  }
  for (const entry of overlayZoom) {
    assert.deepEqual(entry.xAxisIndex, [0, 1]);
  }
  for (const entry of entries(80, false)) {
    assert.equal(entry.start, 0);
    assert.equal(entry.end, 100);
  }
});

test("restores a dragged zoom window after chart options change", () => {
  const original = {
    dataZoom: buildPriceDataZoom(1_000, false),
    series: [],
  };
  const restored = applyDataZoomWindow(original, {
    start: 42,
    end: 68,
  });
  const dataZoom = restored.dataZoom as ZoomEntry[];

  assert.notEqual(restored, original);
  assert.ok(dataZoom.length > 0);
  for (const entry of dataZoom) {
    assert.equal(entry.start, 42);
    assert.equal(entry.end, 68);
  }
  for (const entry of original.dataZoom as ZoomEntry[]) {
    assert.equal(entry.start, 88);
    assert.equal(entry.end, 100);
  }
});
