"use client";

import {
  BarChart,
  CandlestickChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import {
  init,
  use as registerEChartsModules,
  type EChartsType,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { useEffect, useRef } from "react";

registerEChartsModules([
  BarChart,
  CandlestickChart,
  LineChart,
  ScatterChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsOption;
  className?: string;
  height?: number;
  ariaLabel: string;
  preserveDataZoom?: boolean;
  dataZoomResetKey?: string;
  onDataZoomChange?: (window: DataZoomWindow) => void;
  horizontalPanDataZoomIds?: readonly string[];
  horizontalPanDirection?: "content" | "window";
}

export interface DataZoomWindow {
  start: number;
  end: number;
}

export const ECHART_REPLACE_MERGE_COMPONENTS = [
  "grid",
  "xAxis",
  "yAxis",
  "dataZoom",
  "series",
] as const;

export function chartReplaceMergeComponents(
  preserveDataZoom: boolean,
  resetZoom: boolean,
  window: DataZoomWindow | null,
) {
  return preserveDataZoom && !resetZoom && window
    ? ECHART_REPLACE_MERGE_COMPONENTS.filter(
        (component) => component !== "dataZoom",
      )
    : ECHART_REPLACE_MERGE_COMPONENTS;
}

export function panDataZoomWindow(
  window: DataZoomWindow,
  dragPixels: number,
  chartWidth: number,
  direction: "content" | "window" = "content",
): DataZoomWindow {
  const span = Math.max(0, Math.min(100, window.end - window.start));
  const maximumStart = 100 - span;
  const delta = chartWidth > 0 ? (dragPixels / chartWidth) * span : 0;
  const start = Math.max(
    0,
    Math.min(maximumStart, window.start + (direction === "window" ? delta : -delta)),
  );
  return { start, end: start + span };
}

interface DataZoomEvent {
  start?: number;
  end?: number;
  batch?: Array<{
    start?: number;
    end?: number;
  }>;
}

export function applyDataZoomWindow(
  option: EChartsOption,
  window: DataZoomWindow | null,
): EChartsOption {
  if (!window || !option.dataZoom) return option;
  const dataZoom = Array.isArray(option.dataZoom)
    ? option.dataZoom
    : [option.dataZoom];
  const end = window.end >= 99 ? 100 : window.end;
  return {
    ...option,
    dataZoom: dataZoom.map((component) => ({
      ...component,
      start: window.start,
      end,
    })),
  };
}

function readDataZoomWindow(event: DataZoomEvent): DataZoomWindow | null {
  const payload = event.batch?.[0] ?? event;
  return Number.isFinite(payload.start) && Number.isFinite(payload.end)
    ? { start: payload.start!, end: payload.end! }
    : null;
}

export function EChart({
  option,
  className,
  height,
  ariaLabel,
  preserveDataZoom = false,
  dataZoomResetKey,
  onDataZoomChange,
  horizontalPanDataZoomIds = [],
  horizontalPanDirection = "content",
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const dataZoomWindowRef = useRef<DataZoomWindow | null>(null);
  const dataZoomResetKeyRef = useRef<string | undefined>(undefined);
  const onDataZoomChangeRef = useRef(onDataZoomChange);
  const horizontalPanDataZoomIdsRef = useRef(horizontalPanDataZoomIds);
  const horizontalPanDirectionRef = useRef(horizontalPanDirection);

  useEffect(() => {
    onDataZoomChangeRef.current = onDataZoomChange;
  }, [onDataZoomChange]);

  useEffect(() => {
    horizontalPanDataZoomIdsRef.current = horizontalPanDataZoomIds;
    horizontalPanDirectionRef.current = horizontalPanDirection;
  }, [horizontalPanDataZoomIds, horizontalPanDirection]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    chartRef.current = chart;
    let panStart: { x: number; window: DataZoomWindow } | null = null;
    const handleDataZoom = (...args: unknown[]) => {
      const window = readDataZoomWindow(
        (args[0] ?? {}) as DataZoomEvent,
      );
      dataZoomWindowRef.current = window;
      if (window) {
        containerRef.current?.setAttribute("data-zoom-start", String(window.start));
        containerRef.current?.setAttribute("data-zoom-end", String(window.end));
        onDataZoomChangeRef.current?.(window);
      }
    };
    chart.on("datazoom", handleDataZoom);
    const readCurrentZoomWindow = () => {
      if (dataZoomWindowRef.current) return dataZoomWindowRef.current;
      const configured = chart.getOption().dataZoom;
      const first = Array.isArray(configured) ? configured[0] : configured;
      return first && Number.isFinite(first.start) && Number.isFinite(first.end)
        ? { start: Number(first.start), end: Number(first.end) }
        : null;
    };
    const handlePanStart = (event: {
      offsetX: number;
      offsetY: number;
      event?: MouseEvent;
    }) => {
      if (
        horizontalPanDataZoomIdsRef.current.length === 0 ||
        event.event?.button !== 0
      ) {
        return;
      }
      // Custom canvas panning must never compete with native slider handles or the legend.
      const grids = chart.getOption().grid;
      const gridCount = Array.isArray(grids) ? grids.length : 1;
      const insidePlot = Array.from({ length: gridCount }, (_, gridIndex) =>
        chart.containPixel({ gridIndex }, [event.offsetX, event.offsetY]),
      ).some(Boolean);
      if (!insidePlot) return;
      const window = readCurrentZoomWindow();
      if (!window || window.end - window.start >= 100) return;
      panStart = { x: event.offsetX, window };
      chart.getZr().setCursorStyle("grabbing");
      event.event.preventDefault();
    };
    const handlePanMove = (event: { offsetX: number; event?: MouseEvent }) => {
      if (!panStart) return;
      const window = panDataZoomWindow(
        panStart.window,
        event.offsetX - panStart.x,
        chart.getWidth(),
        horizontalPanDirectionRef.current,
      );
      chart.dispatchAction({
        type: "dataZoom",
        batch: horizontalPanDataZoomIdsRef.current.map((dataZoomId) => ({
          dataZoomId,
          start: window.start,
          end: window.end,
        })),
      });
      event.event?.preventDefault();
    };
    const handlePanEnd = () => {
      if (!panStart) return;
      panStart = null;
      chart.getZr().setCursorStyle("grab");
    };
    chart.getZr().on("mousedown", handlePanStart);
    chart.getZr().on("mousemove", handlePanMove);
    chart.getZr().on("mouseup", handlePanEnd);
    chart.getZr().on("globalout", handlePanEnd);

    const container = containerRef.current;
    let resizeFrame: number | null = null;
    let appliedWidth = chart.getWidth();
    let appliedHeight = chart.getHeight();
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width === appliedWidth && height === appliedHeight) return;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (chart.isDisposed()) return;
        appliedWidth = width;
        appliedHeight = height;
        chart.resize({ width, height });
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      chart.off("datazoom", handleDataZoom);
      chart.getZr().off("mousedown", handlePanStart);
      chart.getZr().off("mousemove", handlePanMove);
      chart.getZr().off("mouseup", handlePanEnd);
      chart.getZr().off("globalout", handlePanEnd);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const resetZoom = dataZoomResetKeyRef.current !== dataZoomResetKey;
    if (resetZoom) dataZoomWindowRef.current = null;
    const nextOption =
      preserveDataZoom && !resetZoom
        ? applyDataZoomWindow(option, dataZoomWindowRef.current)
        : option;

    chart.setOption(nextOption, {
      lazyUpdate: false,
      replaceMerge: [
        ...chartReplaceMergeComponents(
          preserveDataZoom,
          resetZoom,
          dataZoomWindowRef.current,
        ),
      ],
    });
    dataZoomResetKeyRef.current = dataZoomResetKey;
  }, [dataZoomResetKey, option, preserveDataZoom]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [height]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={height === undefined ? undefined : { height }}
      role="img"
      aria-label={ariaLabel}
      data-pan-direction={horizontalPanDirection}
    />
  );
}
