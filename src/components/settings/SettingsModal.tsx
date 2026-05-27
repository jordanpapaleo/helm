import { useState } from "react";
import { THEMES } from "../../lib/themes";
import { useSettingsStore } from "../../store/settings";
import { useThemeStore } from "../../store/theme";

// ── Tab types ────────────────────────────────────────────────────────────────

type Tab = "typography" | "themes" | "general";

interface TabDef {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

// ── Icon components ───────────────────────────────────────────────────────────
// Inline SVGs keep this component self-contained with no icon library dependency

function TypographyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

const TABS: TabDef[] = [
  { id: "typography", label: "Typography", icon: <TypographyIcon /> },
  { id: "themes", label: "Themes", icon: <PaletteIcon /> },
  { id: "general", label: "General", icon: <SlidersIcon /> },
];

// ── Slider row ────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <div className="flex items-center gap-4">
      <span className="shrink-0 text-right text-sm opacity-50" style={{ width: "9rem" }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range range-accent range-sm flex-1"
      />
      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
        {value}{unit}
      </span>
    </div>
  );
}

// ── Checkbox row ──────────────────────────────────────────────────────────────

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxRow({ label, checked, onChange }: CheckboxRowProps) {
  return (
    <label className="label cursor-pointer justify-start gap-3 rounded-lg px-3 py-2.5 hover:bg-base-300/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded accent-[var(--color-accent)]"
      />
      <span className="label-text">{label}</span>
    </label>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function TypographyTab() {
  const { settings, updateSettings, resetSettings } = useSettingsStore();

  return (
    <div className="flex flex-col gap-5">
      <SliderRow
        label="Font Size"
        value={settings.fontSize}
        min={12}
        max={24}
        step={1}
        unit="pt"
        onChange={(fontSize) => updateSettings({ fontSize })}
      />
      <SliderRow
        label="Line Height"
        value={settings.lineHeight}
        min={1.2}
        max={2.2}
        step={0.1}
        unit="em"
        onChange={(lineHeight) => updateSettings({ lineHeight })}
      />

      <div className="mt-2 border-t border-base-300 pt-4">
        <button type="button" onClick={resetSettings} className="btn btn-ghost btn-sm">
          Restore Defaults
        </button>
      </div>
    </div>
  );
}

function ThemesTab() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="grid grid-cols-3 gap-3">
      {[...THEMES]
        .sort((a, b) => {
          if (a.colorScheme !== b.colorScheme) return a.colorScheme === "light" ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((t) => {
          const isActive = theme.id === t.id;
          return (
            <button
              type="button"
              key={t.id}
              data-theme={t.id}
              onClick={() => setTheme(t.id)}
              className="rounded-xl border-2 p-4 text-left transition-all"
              style={{
                backgroundColor: "var(--color-base-100)",
                color: "var(--color-base-content)",
                borderColor: isActive ? "var(--color-primary)" : "var(--color-border)",
                boxShadow: isActive ? "0 0 0 1px var(--color-primary)" : "none",
              }}
            >
              <p className="mb-2 text-sm font-bold">{t.name}</p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "color-mix(in oklab, var(--color-base-content) 60%, transparent)" }}
              >
                Lorem ipsum{" "}
                <strong style={{ color: "var(--color-base-content)" }}>dolor sit amet</strong>,
                consectetur adipiscing elit. Iaculis{" "}
                <span style={{ color: "var(--color-accent)" }}>semper</span> pharetra.
              </p>
            </button>
          );
        })}
    </div>
  );
}

function GeneralTab() {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <div className="flex flex-col gap-1">
      <CheckboxRow
        label="Autocomplete WikiLinks"
        checked={settings.autocompleteWikiLinks}
        onChange={(v) => updateSettings({ autocompleteWikiLinks: v })}
      />
      <CheckboxRow
        label="Auto-save on edit"
        checked={settings.autoSaveOnEdit}
        onChange={(v) => updateSettings({ autoSaveOnEdit: v })}
      />
      <CheckboxRow
        label="Pinned notes float to top"
        checked={settings.pinnedNotesFloat}
        onChange={(v) => updateSettings({ pinnedNotesFloat: v })}
      />
      <CheckboxRow
        label="Show note count on tags"
        checked={settings.showNoteCountOnTags}
        onChange={(v) => updateSettings({ showNoteCountOnTags: v })}
      />
      <CheckboxRow
        label="Default to Markdown view"
        checked={settings.defaultNoteView === "markdown"}
        onChange={(v) => updateSettings({ defaultNoteView: v ? "markdown" : "editor" })}
      />
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("typography");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop captures clicks outside the dialog
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="flex flex-col rounded-2xl border border-base-300 bg-base-200 shadow-2xl"
        style={{ width: 760, maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center border-b border-base-300 px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle absolute right-4"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div role="tablist" className="tabs tabs-border px-4 shrink-0">
          {TABS.map((tab) => (
            <button
              type="button"
              role="tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab gap-2 ${activeTab === tab.id ? "tab-active" : ""}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto p-6">
          {activeTab === "typography" && <TypographyTab />}
          {activeTab === "themes" && <ThemesTab />}
          {activeTab === "general" && <GeneralTab />}
        </div>
      </div>
    </div>
  );
}
