import { invokeLLM } from "./_core/llm";

export type NoteCategory = "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning";
export type NotePriority = "Low" | "Medium" | "High";

export interface AIAnalysisResult {
  category: NoteCategory;
  priority: NotePriority;
  title: string;
  extractedDate?: Date;
  extractedTime?: string;
}

/**
 * Analyze note content and extract category, priority, title, and date/time information
 */
export async function analyzeNoteContent(content: string): Promise<AIAnalysisResult> {
  const systemPrompt = `You are an AI assistant that analyzes user notes and extracts structured information.

Your task is to:
1. Categorize the note into exactly ONE of these categories: Tasks, Deadlines, Schedule, Thoughts, Learning
2. Detect the priority level: Low, Medium, or High
3. Generate a concise title (max 50 characters)
4. Extract any date/time information if present

Category definitions:
- Tasks: Action items, todos, things to do
- Deadlines: Time-sensitive items with due dates, submissions, deliverables
- Schedule: Appointments, meetings, events, calendar items
- Thoughts: Ideas, reflections, personal notes, observations
- Learning: Educational content, insights, knowledge, skills

Priority detection:
- High: Urgent, critical, time-sensitive, important deadlines
- Medium: Normal priority, regular tasks
- Low: Optional, nice-to-have, someday items

For date/time extraction, parse natural language like "tomorrow at 3pm", "Friday at 10am", "next week", etc.

Return ONLY valid JSON with no markdown formatting:
{
  "category": "Tasks|Deadlines|Schedule|Thoughts|Learning",
  "priority": "Low|Medium|High",
  "title": "extracted title",
  "extractedDate": "ISO 8601 date string or null",
  "extractedTime": "HH:MM format or null"
}`;

  const userMessage = `Analyze this note and extract the information:\n\n"${content}"`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const responseContent = response.choices[0]?.message?.content;
    const responseText = typeof responseContent === "string" ? responseContent : "{}";
    
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = responseText.match(/{[^{}]*}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    
    const parsed = JSON.parse(jsonStr);

    return {
      category: parsed.category || "Thoughts",
      priority: parsed.priority || "Medium",
      title: parsed.title || "Untitled Note",
      extractedDate: parsed.extractedDate ? new Date(parsed.extractedDate) : undefined,
      extractedTime: parsed.extractedTime || undefined,
    };
  } catch (error) {
    console.error("[AI] Error analyzing note:", error);
    // Return safe defaults if analysis fails
    return {
      category: "Thoughts",
      priority: "Medium",
      title: content.substring(0, 50) || "Untitled Note",
    };
  }
}

/**
 * Extract dates and times from natural language text
 * Returns the next occurrence of the specified date/time
 */
export function extractDateTimeFromText(text: string): { date?: Date; time?: string } {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Simple date patterns. Order matters: the longer, more specific phrase is
  // tested first ("next week" before "week", "next monday" before "monday").
  const patterns = [
    { regex: /next\s+week/i, date: nextWeek },
    { regex: /tomorrow/i, date: tomorrow },
    { regex: /today/i, date: now },
    { regex: /next\s+monday/i, date: getNextDayOfWeek("Monday") },
    { regex: /next\s+tuesday/i, date: getNextDayOfWeek("Tuesday") },
    { regex: /next\s+wednesday/i, date: getNextDayOfWeek("Wednesday") },
    { regex: /next\s+thursday/i, date: getNextDayOfWeek("Thursday") },
    { regex: /next\s+friday/i, date: getNextDayOfWeek("Friday") },
    { regex: /next\s+saturday/i, date: getNextDayOfWeek("Saturday") },
    { regex: /next\s+sunday/i, date: getNextDayOfWeek("Sunday") },
    { regex: /monday/i, date: getNextDayOfWeek("Monday") },
    { regex: /tuesday/i, date: getNextDayOfWeek("Tuesday") },
    { regex: /wednesday/i, date: getNextDayOfWeek("Wednesday") },
    { regex: /thursday/i, date: getNextDayOfWeek("Thursday") },
    { regex: /friday/i, date: getNextDayOfWeek("Friday") },
    { regex: /saturday/i, date: getNextDayOfWeek("Saturday") },
    { regex: /sunday/i, date: getNextDayOfWeek("Sunday") },
  ];

  let extractedDate: Date | undefined;
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      extractedDate = pattern.date;
      break;
    }
  }

  return { date: extractedDate, time: extractTimeFromText(text) };
}

/**
 * Extract a clock time from natural language text.
 *
 * Two shapes are recognised: a 24-hour "HH:MM" and a 12-hour "9am" / "3 pm".
 * The "at" is optional - "standup 9am" carries a time just as "at 9am" does.
 *
 * An IMPOSSIBLE time is refused rather than coerced: "25:99" and "at 13pm" are
 * not times, and the old code passed "25:99" straight to setHours(), which
 * silently rolled the note into the following day - a reminder at a time the
 * user never wrote. Refusing leaves the time undefined, so the note keeps its
 * date and gets no invented clock time.
 */
export function extractTimeFromText(text: string): string | undefined {
  const hhmm = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (hours > 23 || minutes > 59) return undefined;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const ampm = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (ampm) {
    const hour12 = Number(ampm[1]);
    if (hour12 < 1 || hour12 > 12) return undefined;
    const isPm = ampm[2].toLowerCase() === "pm";
    const hours = isPm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
    return `${String(hours).padStart(2, "0")}:00`;
  }

  return undefined;
}

/**
 * Get the next occurrence of a specific day of the week
 */
function getNextDayOfWeek(dayName: string): Date {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayIndex = days.indexOf(dayName);
  const now = new Date();
  const currentDay = now.getDay();
  let daysAhead = dayIndex - currentDay;

  if (daysAhead <= 0) {
    daysAhead += 7;
  }

  const result = new Date(now);
  result.setDate(result.getDate() + daysAhead);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Combine extracted date and time into a single datetime
 */
export function combineDateAndTime(date: Date | undefined, time: string | undefined): Date | undefined {
  if (!date) return undefined;

  const result = new Date(date);
  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    result.setHours(hours, minutes, 0, 0);
  }

  return result;
}
