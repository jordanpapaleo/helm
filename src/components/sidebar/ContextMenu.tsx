import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type ContextMenuItem =
  | { kind: "action"; label: string; danger?: boolean; onClick: () => void }
  | { kind: "separator" }
  | { kind: "submenu"; label: string; items: Array<{ label: string; onClick: () => void }> };

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const menuCls =
  "fixed z-50 min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl";
const submenuCls =
  "absolute z-50 min-w-[160px] max-w-[22rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl";
const itemCls =
  "flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]";

function directItems(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter(
    (button) => button.closest('[role="menu"]') === menu,
  );
}

function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }
  const items = directItems(event.currentTarget);
  if (items.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "Home") {
    items[0]?.focus();
    return;
  }
  if (event.key === "End") {
    items[items.length - 1]?.focus();
    return;
  }
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const next = index === -1 ? 0 : (index + delta + items.length) % items.length;
  items[next]?.focus();
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  // Start at the requested position; clamped after the first paint so the
  // menu never clips outside the viewport.
  const [pos, setPos] = useState({ x, y });
  // Whether to open submenus to the right or left. Determined after first
  // paint based on remaining horizontal space.
  const [submenuFlipped, setSubmenuFlipped] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    directItems(ref.current)[0]?.focus();
  }, []);

  useEffect(() => {
    if (openSubmenu === null) return;
    submenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [openSubmenu]);

  // Clamp position so the menu stays fully within the viewport. Running in
  // useLayoutEffect avoids the one-frame flash at the unclamped position.
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 4);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 4);
    setPos({ x: clampedX, y: clampedY });

    // Flip submenus left when there isn't enough room to the right. 160px is
    // the submenu min-width plus a small buffer.
    setSubmenuFlipped(window.innerWidth - rect.right < 164);
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      className={menuCls}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={handleMenuKeyDown}
    >
      {items.map((item, i) => {
        if (item.kind === "separator") {
          const prev = items[i - 1];
          const next = items[i + 1];
          const prevLabel = prev && prev.kind !== "separator" ? prev.label : "";
          const nextLabel = next && next.kind !== "separator" ? next.label : "";
          return (
            <div
              key={`separator-${prevLabel}-${nextLabel}`}
              className="my-1 border-t border-[var(--color-border)]"
            />
          );
        }
        if (item.kind === "submenu") {
          const submenuPositionCls = submenuFlipped ? "right-full" : "left-full";
          return (
            <div
              key={item.label}
              role="none"
              className="relative"
              onMouseEnter={() => setOpenSubmenu(i)}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={openSubmenu === i}
                className={`${itemCls} justify-between cursor-default select-none`}
                onClick={() => setOpenSubmenu(openSubmenu === i ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenSubmenu(i);
                  } else if (e.key === "ArrowLeft" || e.key === "Escape") {
                    e.stopPropagation();
                    setOpenSubmenu(null);
                    e.currentTarget.focus();
                  }
                }}
              >
                <span>{item.label}</span>
                <span className="ml-4 text-xs text-[var(--color-text-muted)]" aria-hidden="true">
                  ▶
                </span>
              </button>
              {openSubmenu === i && (
                <div
                  ref={submenuRef}
                  role="menu"
                  aria-label={item.label}
                  className={`${submenuCls} ${submenuPositionCls} top-0`}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenSubmenu(null);
                    } else {
                      handleMenuKeyDown(e);
                    }
                  }}
                >
                  {item.items.map((sub) => (
                    <button
                      key={`${item.label}-${sub.label}`}
                      type="button"
                      role="menuitem"
                      title={sub.label}
                      className={itemCls}
                      onClick={() => {
                        sub.onClick();
                        onClose();
                      }}
                    >
                      <span className="whitespace-normal">{sub.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`${itemCls} ${item.danger ? "text-red-400" : ""}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
