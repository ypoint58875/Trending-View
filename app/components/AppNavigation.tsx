"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, CalendarRange, ChartNoAxesCombined } from "lucide-react";
import { zhCN } from "../i18n/zh-CN";
export function AppNavigation() {
  const path = usePathname();
  return <nav className="app-bottom-navigation worksheet-tabs" aria-label={zhCN.navigation.label}>
    {[["/", "research", FlaskConical], ["/strategy-validation", "cycles", CalendarRange], ["/trend-analysis", "trend", ChartNoAxesCombined]].map(([href, key, Icon]) => {
      const Component = Icon as typeof FlaskConical;
      return <Link className="worksheet-tab" key={String(href)} href={String(href)} prefetch={false} aria-current={path === href ? "page" : undefined}>
        <Component size={14} aria-hidden="true" />{zhCN.navigation[key as "research" | "cycles" | "trend"]}
      </Link>;
    })}
  </nav>;
}
