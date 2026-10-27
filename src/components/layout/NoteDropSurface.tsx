import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { bindNoteDropTarget } from "../../lib/note-drag";

interface NoteDropSurfaceProps {
  dropId: string;
  /** When false the row renders but does not accept a note. */
  enabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onDropNote: (noteId: string) => void;
  children: ReactNode;
}

export function NoteDropSurface({
  dropId,
  enabled = true,
  className,
  style,
  onContextMenu,
  onDropNote,
  children,
}: NoteDropSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onDropNoteRef = useRef(onDropNote);
  onDropNoteRef.current = onDropNote;
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!over) return;
    const clear = () => setOver(false);
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, [over]);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    return bindNoteDropTarget(
      element,
      (noteId) => onDropNoteRef.current(noteId),
      (next) => {
        setOver((current) => (current === next ? current : next));
      },
    );
  }, [enabled]);

  if (!enabled) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: context menu only; buttons inside keep keyboard actions
      <div className={className} style={style} onContextMenu={onContextMenu}>
        {children}
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target; the buttons inside keep keyboard actions
    <div
      ref={ref}
      data-drop-target={dropId}
      data-drop-active={over ? "true" : "false"}
      className={[className, over ? "outline outline-1 outline-primary" : ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}
