import { Icon } from "@iconify/react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createNote, creationTargetFromUI } from "../../lib/create-note";
import { listTemplateChoices } from "../../lib/templates";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";

interface TemplateMenuProps {
  id?: string;
  x: number;
  y: number;
  label: string;
  triggerRef?: RefObject<HTMLElement | null>;
  onSelect: (templateId: string | null) => void;
  /** `dismiss` is Escape, outside click, or Tab. `select` is choosing an item. */
  onClose: (reason: "select" | "dismiss") => void;
}

interface MenuEntry {
  id: string | null;
  label: string;
}

/**
 * Blank, then every available template. Reads the note index directly so a
 * rename, flag change, or deletion updates the list while it is open.
 */
export function TemplateMenu({
  id,
  x,
  y,
  label,
  triggerRef,
  onSelect,
  onClose,
}: TemplateMenuProps) {
  const notes = useNoteStore((s) => s.notes);
  const vaults = useNoteStore((s) => s.vaults);
  const generatedId = useId();
  const menuId = id ?? generatedId;
  const items = useMemo<MenuEntry[]>(() => {
    const choices = listTemplateChoices(notes, vaults);
    return [
      { id: null, label: "Blank" },
      ...choices.map((choice) => ({ id: choice.id, label: choice.label })),
    ];
  }, [notes, vaults]);

  const ref = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState({ x, y });
  const safeIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;
    // Reclamp when the list changes (a template was renamed, added, or removed).
    const rect = el.getBoundingClientRect();
    const next = {
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    };
    setPos((current) => (current.x === next.x && current.y === next.y ? current : next));
  }, [x, y, items]);

  useEffect(() => {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    const count = items.length;
    if (!buttons || count === 0) return;
    buttons[Math.min(safeIndex, count - 1)]?.focus();
  }, [safeIndex, items]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose("dismiss");
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose("dismiss");
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, triggerRef]);

  function move(next: number) {
    if (items.length === 0) return;
    setActiveIndex((next + items.length) % items.length);
  }

  return (
    <div
      ref={ref}
      id={menuId}
      role="menu"
      aria-label={label}
      className="fixed z-50 max-h-80 min-w-[12rem] max-w-[22rem] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(safeIndex + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(safeIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          setActiveIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setActiveIndex(items.length - 1);
        } else if (event.key === "Tab") {
          onClose("dismiss");
        }
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.id ?? "blank"}
          type="button"
          role="menuitem"
          tabIndex={index === safeIndex ? 0 : -1}
          title={item.label}
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => {
            onSelect(item.id);
            onClose("select");
          }}
        >
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

interface NewNoteMenuProps {
  className?: string;
  ariaLabel: string;
  title?: string;
  /** Bundled Iconify name, `uil:*` only. */
  icon?: string;
  disabled?: boolean;
  children?: ReactNode;
  onSelect: (templateId: string | null) => void;
}

/**
 * The New Note control: a button that opens Blank followed by template titles.
 */
export function NewNoteMenu({
  className,
  ariaLabel,
  title,
  icon,
  disabled,
  children,
  onSelect,
}: NewNoteMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ x: rect.left, y: rect.bottom + 4 });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${className ?? ""}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={title ?? ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {icon && <Icon icon={icon} className="h-4 w-4" aria-hidden="true" />}
        {children}
      </button>
      {open && anchor && (
        <TemplateMenu
          id={menuId}
          x={anchor.x}
          y={anchor.y}
          label={ariaLabel}
          triggerRef={buttonRef}
          onSelect={onSelect}
          onClose={(reason) => {
            setOpen(false);
            if (reason === "dismiss") buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * Menu opened by File ▸ New Note / ⌘N. Same Blank-then-templates list, using
 * the note list's folder and tag context.
 */
export function GlobalNewNoteMenu() {
  const open = useUIStore((s) => s.newNoteMenuOpen);
  const closeNewNoteMenu = useUIStore((s) => s.closeNewNoteMenu);
  if (!open) return null;

  const x =
    typeof window === "undefined" ? 16 : Math.max(16, Math.round(window.innerWidth / 2 - 140));

  return (
    <TemplateMenu
      x={x}
      y={64}
      label="New note"
      onSelect={(templateId) => {
        void createNote({ ...creationTargetFromUI(), templateId });
      }}
      onClose={() => closeNewNoteMenu()}
    />
  );
}
