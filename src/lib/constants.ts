export const NOTE_STATES: string[] = ["Prepare", "Doing", "Maintain", "Done"];

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
