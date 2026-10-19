import { useEffect, useId, useRef, useState } from "react";

interface CreateProjectDialogProps {
  onCancel: () => void;
  onCreate: (name: string, repository: string) => void;
}

export function CreateProjectDialog({ onCancel, onCreate }: CreateProjectDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const repoId = useId();
  const [name, setName] = useState("");
  const [repository, setRepository] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop captures clicks outside the dialog
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-base-300 bg-base-200 p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          New project
        </h2>
        <p className="mt-1 text-sm opacity-60">
          Creates Thinking, Features, Bugs, and Context / Docs, plus a main page. A repository is
          optional.
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onCreate(trimmed, repository);
          }}
        >
          <label htmlFor={nameId} className="flex flex-col gap-1 text-sm">
            Name
            <input
              id={nameId}
              value={name}
              ref={nameRef}
              onChange={(event) => setName(event.target.value)}
              required
              className="input input-bordered w-full"
            />
          </label>
          <label htmlFor={repoId} className="flex flex-col gap-1 text-sm">
            Repository
            <span className="text-xs opacity-50">Optional. The project works without one.</span>
            <input
              id={repoId}
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              placeholder="https://github.com/you/repo"
              className="input input-bordered w-full"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Create project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
