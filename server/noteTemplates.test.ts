import { describe, expect, it } from "vitest";
import { filterTemplates, noteTemplates, reorderTemplates, updateTemplate } from "../client/src/data/noteTemplates";

describe("noteTemplates", () => {
  it("contains 25 unique templates across the five note categories", () => {
    expect(noteTemplates).toHaveLength(25);
    expect(new Set(noteTemplates.map((template) => template.id)).size).toBe(25);
    expect(new Set(noteTemplates.map((template) => template.category))).toEqual(
      new Set(["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"]),
    );
  });

  it("provides usable starter content for every template", () => {
    for (const template of noteTemplates) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.content.length).toBeGreaterThan(10);
    }
  });

  it("moves a dragged custom template to the drop target", () => {
    const templates = noteTemplates.slice(0, 3);
    const reordered = reorderTemplates(templates, templates[0].id, templates[2].id);
    expect(reordered.map((template) => template.id)).toEqual([templates[1].id, templates[2].id, templates[0].id]);
    expect(reorderTemplates(templates, "missing", templates[1].id)).toBe(templates);
  });

  it("updates a template without changing its position", () => {
    const templates = noteTemplates.slice(0, 2);
    const updated = { ...templates[0], title: "Renamed" };
    expect(updateTemplate(templates, updated).map((template) => template.title)).toEqual(["Renamed", templates[1].title]);
  });

  it("filters templates by title query and category", () => {
    expect(filterTemplates(noteTemplates, "meeting", "Schedule")).toHaveLength(1);
    expect(filterTemplates(noteTemplates, "meeting", "Learning")).toHaveLength(0);
  });
});
