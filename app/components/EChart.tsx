"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";

interface EChartProps {
  option: echarts.EChartsOption;
  className?: string;
  ariaLabel: string;
  preserveDataZoom?: boolean;
  dataZoomResetKey?: string;
}

export interface DataZoomWindow {
  start: number;
  end: number;
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
  option: echarts.EChartsOption,
  window: DataZoomWindow | null,
): echarts.EChartsOption {
  if (!window || !option.dataZoom) return option;
  const dataZoom = Array.isArray(option.dataZoom)
    ? option.dataZoom
    : [option.dataZoom];
  return {
    ...option,
    dataZoom: dataZoom.map((component) => ({
      ...component,
      start: window.start,
      end: window.end,
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
  ariaLabel,
  preserveDataZoom = false,
  dataZoomResetKey,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const dataZoomWindowRef = useRef<DataZoomWindow | null>(null);
  const dataZoomResetKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    chartRef.current = chart;
    const handleDataZoom = (event: DataZoomEvent) => {
      dataZoomWindowRef.current = readDataZoomWindow(event);
    };
    chart.on("datazoom", handleDataZoom);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.off("datazoom", handleDataZoom);
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

    chart.setOption(nextOption, { notMerge: true, lazyUpdate: false });
    dataZoomResetKeyRef.current = dataZoomResetKey;
  }, [dataZoomResetKey, option, preserveDataZoom]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
