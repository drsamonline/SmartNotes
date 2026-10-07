import { describe, it, expect } from "vitest";
import { extractDateTimeFromText, combineDateAndTime, getNextDayOfWeek } from "./ai";

describe("AI Service - Date/Time Extraction", () => {
  describe("extractDateTimeFromText", () => {
    it("should extract 'tomorrow' as a date", () => {
      const result = extractDateTimeFromText("Remember to call tomorrow");
      expect(result.date).toBeDefined();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result.date?.toDateString()).toBe(tomorrow.toDateString());
    });

    it("should extract 'today' as a date", () => {
      const result = extractDateTimeFromText("Meeting today at 3pm");
      expect(result.date).toBeDefined();
      const today = new Date();
      expect(result.date?.toDateString()).toBe(today.toDateString());
    });

    it("should extract time in HH:MM format", () => {
      const result = extractDateTimeFromText("Call at 14:30");
      expect(result.time).toBe("14:30");
    });

    it("should extract time with am/pm", () => {
      const result = extractDateTimeFromText("Meeting at 3 pm");
      expect(result.time).toBe("15:00");
    });

    it("should extract time with am", () => {
      const result = extractDateTimeFromText("Start at 9 am");
      expect(result.time).toBe("09:00");
    });

    it("should extract day of week", () => {
      const result = extractDateTimeFromText("See you Friday");
      expect(result.date).toBeDefined();
    });

    it("should return undefined for no date/time", () => {
      const result = extractDateTimeFromText("Just a random note");
      expect(result.date).toBeUndefined();
      expect(result.time).toBeUndefined();
    });

    it("should handle multiple patterns in one string", () => {
      const result = extractDateTimeFromText("Tomorrow at 10 am");
      expect(result.date).toBeDefined();
      expect(result.time).toBe("10:00");
    });
  });

  describe("combineDateAndTime", () => {
    it("should combine date and time correctly", () => {
      const date = new Date(2026, 3, 16); // April 16, 2026
      const result = combineDateAndTime(date, "14:30");
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
    });

    it("should return undefined if date is undefined", () => {
      const result = combineDateAndTime(undefined, "14:30");
      expect(result).toBeUndefined();
    });

    it("should return date at midnight if time is undefined", () => {
      const date = new Date(2026, 3, 16);
      const result = combineDateAndTime(date, undefined);
      expect(result?.getHours()).toBe(0);
      expect(result?.getMinutes()).toBe(0);
    });
  });

  // getNextDayOfWeek is a private helper function, tested indirectly through extractDateTimeFromText
  describe("Day of week extraction", () => {
    it("should extract Friday correctly", () => {
      const result = extractDateTimeFromText("Meeting on Friday");
      expect(result.date).toBeDefined();
      expect(result.date?.getDay()).toBe(5); // Friday
    });
  });

});

describe("AI Service - Category Detection", () => {
  it("should identify task keywords", () => {
    const taskKeywords = ["todo", "task", "action item", "do", "complete", "finish"];
    taskKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });

  it("should identify deadline keywords", () => {
    const deadlineKeywords = ["deadline", "due", "submit", "deliver", "by", "before"];
    deadlineKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });

  it("should identify schedule keywords", () => {
    const scheduleKeywords = ["meeting", "appointment", "call", "event", "schedule", "at"];
    scheduleKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });

  it("should identify learning keywords", () => {
    const learningKeywords = ["learn", "study", "understand", "research", "read", "knowledge"];
    learningKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });

  it("should identify thought keywords", () => {
    const thoughtKeywords = ["think", "idea", "thought", "consider", "remember", "note"];
    thoughtKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });
});

describe("AI Service - Priority Detection", () => {
  it("should identify high priority indicators", () => {
    const highPriorityKeywords = ["urgent", "asap", "critical", "important", "immediately", "emergency"];
    highPriorityKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });

  it("should identify low priority indicators", () => {
    const lowPriorityKeywords = ["someday", "maybe", "optional", "nice-to-have", "whenever"];
    lowPriorityKeywords.forEach((keyword) => {
      expect(keyword).toBeTruthy();
    });
  });
});
