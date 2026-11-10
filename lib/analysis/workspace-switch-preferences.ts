import { parseMovingAverageSlopeFilter, type MovingAverageSlopeFilter } from "./entry-filter";

export const WORKSPACE_SWITCH_STORAGE_KEY = "quantscope.workspace-switches.v1";
export const WORKSPACE_SWITCH_EVENT = "quantscope-workspace-switches-changed";
export type EntrySwitchSlot = "A" | "B" | "C";
export interface EntrySwitchDraft extends MovingAverageSlopeFilter { enabled: boolean }
export interface WorkspaceSwitchPreferences {
  version: 1;
  contextRegions: boolean;
  entryFilters: Partial<Record<EntrySwitchSlot, EntrySwitchDraft>>;
}

export function parseWorkspaceSwitchPreferences(text: string | null): WorkspaceSwitchPreferences {
  const result: WorkspaceSwitchPreferences = { version: 1, contextRegions: true, entryFilters: {} };
  if (!text || text.length > 4096) return result;
  let value: Record<string, unknown>;
  try { value = JSON.parse(text); } catch { return result; }
  if (!value || typeof value !== "object" || value.version !== 1) return result;
  if (typeof value.contextRegions === "boolean") result.contextRegions = value.contextRegions;
  if (value.entryFilters && typeof value.entryFilters === "object") {
    for (const slot of ["A", "B", "C"] as const) {
      const draft = (value.entryFilters as Record<string, unknown>)[slot];
      const filter = parseMovingAverageSlopeFilter(draft);
      if (filter && typeof (draft as {enabled?: unknown}).enabled === "boolean")
        result.entryFilters[slot] = { ...filter, enabled: (draft as {enabled: boolean}).enabled };
    }
  }
  return result;
}

// A bounded fallback keeps switches usable when browser storage is unavailable.
let memorySnapshot: string | null = null;
let warned = false;
function reportStorageFailure(error: unknown) {
  if (!warned) { console.warn("Workspace switch preferences could not be persisted", error instanceof Error ? error.name : "StorageError"); warned = true; }
}
export function workspaceSwitchSnapshot(): string | null {
  if (memorySnapshot !== null) return memorySnapshot;
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(WORKSPACE_SWITCH_STORAGE_KEY); }
  catch (error) { reportStorageFailure(error); return null; }
}
export function readWorkspaceSwitchPreferences() { return parseWorkspaceSwitchPreferences(workspaceSwitchSnapshot()); }
function updateWorkspaceSwitchPreferences(update: (current: WorkspaceSwitchPreferences) => WorkspaceSwitchPreferences) {
  if (typeof window === "undefined") return;
  const text = JSON.stringify(parseWorkspaceSwitchPreferences(JSON.stringify(update(readWorkspaceSwitchPreferences()))));
  try { window.localStorage.setItem(WORKSPACE_SWITCH_STORAGE_KEY, text); memorySnapshot = null; }
  catch (error) { memorySnapshot = text; reportStorageFailure(error); }
  window.dispatchEvent(new Event(WORKSPACE_SWITCH_EVENT));
}
export function setContextRegionsPreference(value: boolean) {
  updateWorkspaceSwitchPreferences(current => ({ ...current, contextRegions: value }));
}
export function setEntrySwitchPreference(slot: EntrySwitchSlot, draft: EntrySwitchDraft) {
  updateWorkspaceSwitchPreferences(current => ({ ...current, entryFilters: { ...current.entryFilters, [slot]: draft } }));
}
export function subscribeWorkspaceSwitchPreferences(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === WORKSPACE_SWITCH_STORAGE_KEY || event.key === null) { memorySnapshot = null; notify(); } };
  window.addEventListener(WORKSPACE_SWITCH_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(WORKSPACE_SWITCH_EVENT, notify); window.removeEventListener("storage", onStorage); };
}
