"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";

interface EChartProps {
  option: echarts.EChartsOption;
  className?: string;
  ariaLabel: string;
}

export function EChart({ option, className, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    chart.setOption(option, { notMerge: true, lazyUpdate: true });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={ariaLabel}
    />
  );
}

