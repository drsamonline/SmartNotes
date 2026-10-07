import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, loadPreferences } from "../client/src/lib/preferences";

describe("application preferences", () => {
  it("defaults to a dark, visible, date-sorted workspace outside the browser", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ showStats: true, hideCompleted: false, sortBy: "date", theme: "dark" });
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});
