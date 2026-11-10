"use client";
import { useMemo, useSyncExternalStore } from "react";
import { parseWorkspaceSwitchPreferences, workspaceSwitchSnapshot, subscribeWorkspaceSwitchPreferences } from "@/lib/analysis/workspace-switch-preferences";
const serverSnapshot = () => null;
export function useWorkspaceSwitchPreferences() {
  const snapshot = useSyncExternalStore(subscribeWorkspaceSwitchPreferences, workspaceSwitchSnapshot, serverSnapshot);
  return useMemo(() => parseWorkspaceSwitchPreferences(snapshot), [snapshot]);
}
