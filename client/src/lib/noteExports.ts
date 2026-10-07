export type ExportableNote = {
  id?: number;
  title: string;
  content: string;
  category: string;
  priority: string;
  isCompleted: number;
  dueDate?: Date | string | null;
  scheduledDate?: Date | string | null;
  createdAt?: Date | string | null;
};

export type ExportFilters = {
  category?: string;
  startDate?: string;
  endDate?: string;
};

export function filterNotes(notes: ExportableNote[], filters: ExportFilters) {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null;
  return notes.filter((note) => {
    if (filters.category && filters.category !== "All" && note.category !== filters.category) return false;
    if (!start && !end) return true;
    if (!note.createdAt) return false;
    const created = note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    return (!start || created >= start) && (!end || created <= end);
  });
}

function formatDate(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
}

export function notesToCsv(notes: ExportableNote[]) {
  const headers = ["Title", "Content", "Category", "Priority", "Completed", "Due Date", "Scheduled Date", "Created At"];
  const rows = notes.map((note) => [
    note.title,
    note.content,
    note.category,
    note.priority,
    note.isCompleted ? "Yes" : "No",
    formatDate(note.dueDate),
    formatDate(note.scheduledDate),
    formatDate(note.createdAt),
  ]);
  return [headers, ...rows].map((row) => row.map((value) => escapeCsv(String(value))).join(",")).join("\n");
}

export function notesToMarkdown(notes: ExportableNote[], exportedAt = new Date()) {
  const lines = ["# SmartNote Scheduler Export", "", `Exported: ${exportedAt.toISOString()}`, "", `Total notes: ${notes.length}`, ""];
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    lines.push(`## ${index + 1}. ${note.title}`, "", `- **Category:** ${note.category}`, `- **Priority:** ${note.priority}`, `- **Status:** ${note.isCompleted ? "Completed" : "Pending"}`);
    if (note.dueDate) lines.push(`- **Due:** ${formatDate(note.dueDate)}`);
    if (note.scheduledDate) lines.push(`- **Scheduled:** ${formatDate(note.scheduledDate)}`);
    lines.push("", note.content.trim(), "");
  }
  return lines.join("\n");
}
