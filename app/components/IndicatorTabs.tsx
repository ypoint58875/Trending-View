"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { zhCN } from "../i18n/zh-CN";
export function IndicatorTabs({ tabs, value, onChange, label }: { tabs: readonly { key: string; label: string }[]; value: string; onChange: (value: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const update = () => setEdges({ left: node.scrollLeft > 1, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 1 });
    const observer = new ResizeObserver(update); observer.observe(node); node.addEventListener("scroll", update); update();
    return () => { observer.disconnect(); node.removeEventListener("scroll", update); };
  }, [tabs]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [value]);
  const overflow = edges.left || edges.right;
  return <div className={`indicator-tabs-shell${overflow ? " has-overflow" : ""}`}>
    <div className="indicator-tabs-scroll worksheet-tabs" ref={ref} role="tablist" aria-label={label}>
      {tabs.map(tab => <button className="worksheet-tab" type="button" role="tab" key={tab.key} aria-selected={value === tab.key} onClick={() => onChange(tab.key)}>{tab.label}</button>)}
    </div>
    {overflow && <div className="indicator-tabs-arrows"><button type="button" aria-label={zhCN.trendAnalysis.previousTabs} disabled={!edges.left} onClick={() => ref.current?.scrollBy({ left: -280, behavior: "smooth" })}><ChevronLeft size={16} /></button><button type="button" aria-label={zhCN.trendAnalysis.nextTabs} disabled={!edges.right} onClick={() => ref.current?.scrollBy({ left: 280, behavior: "smooth" })}><ChevronRight size={16} /></button></div>}
  </div>;
}
