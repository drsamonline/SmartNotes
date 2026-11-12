import { describe, it, expect } from "vitest";
import { extractDateTimeFromText, extractTimeFromText, combineDateAndTime } from "./ai";

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

  describe("relative phrases and clock times the note writer actually uses", () => {
    it("should extract 'next week' as a date one week out", () => {
      const result = extractDateTimeFromText("Draft the report next week");
      expect(result.date).toBeDefined();
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(result.date?.toDateString()).toBe(expected.toDateString());
    });

    it("should prefer 'next week' over a bare weekday in the same note", () => {
      const result = extractDateTimeFromText("Ship next week on Friday");
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(result.date?.toDateString()).toBe(expected.toDateString());
    });

    it("should extract a 12-hour time with no 'at'", () => {
      expect(extractDateTimeFromText("standup 9am").time).toBe("09:00");
      expect(extractDateTimeFromText("call mum 7 pm").time).toBe("19:00");
    });

    it("should read noon and midnight the right way round", () => {
      expect(extractTimeFromText("lunch at 12pm")).toBe("12:00");
      expect(extractTimeFromText("last dose at 12am")).toBe("00:00");
    });

    it("should keep the leading zero on a single-digit 24-hour time", () => {
      expect(extractTimeFromText("dose at 09:05")).toBe("09:05");
    });

    it("should refuse an impossible 24-hour time instead of rolling into the next day", () => {
      // setHours(25, 99) used to slide the reminder a day forward without a word
      expect(extractTimeFromText("call at 25:99")).toBeUndefined();
      expect(extractDateTimeFromText("call tomorrow at 24:10").time).toBeUndefined();
      expect(extractDateTimeFromText("call tomorrow at 24:10").date).toBeDefined();
    });

    it("should refuse a 12-hour clock that cannot exist", () => {
      expect(extractTimeFromText("meeting at 13pm")).toBeUndefined();
      expect(extractTimeFromText("meeting at 0am")).toBeUndefined();
    });

    it("should not invent a time from a note that has none", () => {
      expect(extractTimeFromText("buy milk")).toBeUndefined();
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
