export const NOTE_STATES: string[] = ["Prepare", "Doing", "Maintain", "Done"];

/**
 * Workflow fields cleared when a note is marked `unmanaged`.
 *
 * The keys stay in the frontmatter (only the values are reset) so flipping the
 * note back to managed doesn't require re-adding them. Spread this alongside
 * `unmanaged: true` so the clear lands in a single write.
 */
export const UNMANAGED_CLEARED_FIELDS = {
  state: "",
  urgent: false,
  important: false,
  blocked: false,
} as const;

export const EISENHOWER_QUADRANTS = {
  do: { label: "Do", subtitle: "Urgent & Important", urgent: true, important: true },
  schedule: {
    label: "Schedule",
    subtitle: "Important, not urgent",
    urgent: false,
    important: true,
  },
  delegate: {
    label: "Delegate",
    subtitle: "Urgent, not important",
    urgent: true,
    important: false,
  },
  eliminate: {
    label: "Eliminate",
    subtitle: "Neither urgent nor important",
    urgent: false,
    important: false,
  },
} as const;
