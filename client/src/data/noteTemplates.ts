export type NoteTemplate = {
  id: string;
  title: string;
  description: string;
  category: "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning";
  content: string;
};

const CUSTOM_TEMPLATES_KEY = "smartnote.custom-templates";

export function loadCustomTemplates(): NoteTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(CUSTOM_TEMPLATES_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplates(templates: NoteTemplate[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
    window.dispatchEvent(new CustomEvent("smartnote-templates-changed"));
  }
}

export function reorderTemplates(templates: NoteTemplate[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return templates;
  const sourceIndex = templates.findIndex((template) => template.id === sourceId);
  const targetIndex = templates.findIndex((template) => template.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return templates;
  const next = [...templates];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function updateTemplate(templates: NoteTemplate[], updated: NoteTemplate) {
  return templates.map((template) => template.id === updated.id ? updated : template);
}

export function filterTemplates(templates: NoteTemplate[], query: string, category: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return templates.filter((template) => (category === "All" || template.category === category) && template.title.toLowerCase().includes(normalizedQuery));
}

export const noteTemplates: NoteTemplate[] = [
  { id: "daily-plan", title: "Daily Plan", description: "Plan the day", category: "Tasks", content: "Today's priorities:\n1. \n2. \n3. " },
  { id: "task-breakdown", title: "Task Breakdown", description: "Turn a goal into steps", category: "Tasks", content: "Goal: \nNext action: \nSupporting steps:\n- " },
  { id: "shopping-list", title: "Shopping List", description: "Capture items to buy", category: "Tasks", content: "Shopping list:\n- \n- \n- " },
  { id: "errand-run", title: "Errand Run", description: "Group errands efficiently", category: "Tasks", content: "Errands:\n- Location: / Task: \n- Location: / Task: " },
  { id: "habit-check", title: "Habit Check-in", description: "Track a daily habit", category: "Tasks", content: "Habit: \nDid I complete it? \nWhat helped or blocked me? " },
  { id: "follow-up", title: "Follow-up", description: "Remember the next contact", category: "Tasks", content: "Follow up with: \nAbout: \nNext action: \nFollow-up date: " },
  { id: "project-milestone", title: "Project Milestone", description: "Track a delivery point", category: "Deadlines", content: "Milestone: \nDue date: \nDefinition of done: \nRisks: " },
  { id: "deadline", title: "Deadline", description: "Record a hard due date", category: "Deadlines", content: "Deliverable: \nDue: \nWho needs it: \nFinal check: " },
  { id: "bill-payment", title: "Bill Payment", description: "Track a payment deadline", category: "Deadlines", content: "Bill: \nAmount: \nDue date: \nPayment method: " },
  { id: "exam-prep", title: "Exam Prep", description: "Plan study before an exam", category: "Deadlines", content: "Exam: \nDate: \nTopics to cover:\n- \nStudy sessions: " },
  { id: "meeting", title: "Meeting", description: "Prepare for a meeting", category: "Schedule", content: "Meeting: \nWhen: \nAttendees: \nAgenda:\n- \nDecision needed: " },
  { id: "appointment", title: "Appointment", description: "Capture an appointment", category: "Schedule", content: "Appointment: \nDate and time: \nLocation: \nWhat to bring: " },
  { id: "travel-plan", title: "Travel Plan", description: "Organize a trip detail", category: "Schedule", content: "Trip: \nDeparture: \nArrival: \nBookings: \nChecklist: " },
  { id: "focus-block", title: "Focus Block", description: "Reserve focused time", category: "Schedule", content: "Focus block: \nStart: \nEnd: \nSingle outcome: \nDistractions to avoid: " },
  { id: "event-plan", title: "Event Plan", description: "Plan an upcoming event", category: "Schedule", content: "Event: \nWhen and where: \nGuests: \nPreparation: " },
  { id: "idea", title: "Idea", description: "Capture a new idea", category: "Thoughts", content: "Idea: \nWhy it matters: \nFirst experiment: \nOpen question: " },
  { id: "journal", title: "Journal Entry", description: "Reflect on the day", category: "Thoughts", content: "Today I noticed: \nI felt: \nA moment I want to remember: \nTomorrow I need: " },
  { id: "decision", title: "Decision Log", description: "Record a decision clearly", category: "Thoughts", content: "Decision: \nContext: \nOptions considered: \nWhy this choice: \nRevisit on: " },
  { id: "gratitude", title: "Gratitude", description: "Name what is going well", category: "Thoughts", content: "Today I am grateful for:\n- \n- \nOne person to thank: " },
  { id: "problem", title: "Problem Solver", description: "Work through a problem", category: "Thoughts", content: "Problem: \nKnown facts: \nPossible causes: \nSmallest next test: " },
  { id: "book-notes", title: "Book Notes", description: "Save useful reading notes", category: "Learning", content: "Book / author: \nMain idea: \nBest quote: \nHow I will use it: " },
  { id: "lesson", title: "Lesson Learned", description: "Turn experience into learning", category: "Learning", content: "Lesson: \nWhat happened: \nWhat I would repeat: \nWhat I will change: " },
  { id: "concept", title: "Concept Card", description: "Explain a concept simply", category: "Learning", content: "Concept: \nIn one sentence: \nExample: \nRelated concept: " },
  { id: "course-notes", title: "Course Notes", description: "Structure class notes", category: "Learning", content: "Course / lesson: \nKey points:\n- \nQuestions:\n- \nNext review: " },
  { id: "research", title: "Research Capture", description: "Store a research finding", category: "Learning", content: "Question: \nFinding: \nSource: \nConfidence: \nNext lead: " },
];
