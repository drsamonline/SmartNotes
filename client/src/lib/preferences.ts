export type SortPreference = "date" | "priority" | "category";
export type ThemePreference = "light" | "dark";

export type AppPreferences = {
  showStats: boolean;
  hideCompleted: boolean;
  sortBy: SortPreference;
  theme: ThemePreference;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  showStats: true,
  hideCompleted: false,
  sortBy: "date",
  theme: "dark",
};

const STORAGE_KEY = "smartnote.preferences";

export function loadPreferences(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return {
      ...DEFAULT_PREFERENCES,
      ...(stored && typeof stored === "object" ? stored : {}),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: AppPreferences) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent("smartnote-preferences-changed"));
  }
}
