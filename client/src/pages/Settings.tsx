import { useRef, useState } from "react";
import { BrutalistDashboard } from "@/components/BrutalistDashboard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadPreferences, savePreferences, type AppPreferences, type SortPreference } from "@/lib/preferences";
import { filterTemplates, loadCustomTemplates, reorderTemplates, saveCustomTemplates, updateTemplate, type NoteTemplate } from "@/data/noteTemplates";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { filterNotes, notesToCsv, notesToMarkdown } from "@/lib/noteExports";

const shortcuts = [
  ["N", "Focus the new-note composer"],
  ["⌘ / CTRL + ENTER", "Create the current note"],
  ["?", "Show keyboard shortcuts"],
  ["G then H", "Go to all notes"],
  ["G then S", "Open Settings"],
  ["G then F", "Open Search"],
];

const categories = ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"] as const;
type ExportPreset = { name: string; category: string; startDate: string; endDate: string };
const PRESETS_KEY = "smartnote.export-presets";

function loadExportPresets(): ExportPreset[] {
  try {
    const stored = typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(PRESETS_KEY) || "[]") : [];
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [saved, setSaved] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<NoteTemplate[]>(() => loadCustomTemplates());
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState<NoteTemplate["category"]>("Tasks");
  const [templateContent, setTemplateContent] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [draggedTemplateId, setDraggedTemplateId] = useState<string | null>(null);
  const [exportCategory, setExportCategory] = useState("All");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilterCategory, setTemplateFilterCategory] = useState("All");
  const [exportPresets, setExportPresets] = useState<ExportPreset[]>(() => loadExportPresets());
  const [presetName, setPresetName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: notes = [] } = trpc.notes.list.useQuery();
  const importBackup = trpc.notes.importBackup.useMutation({
    onSuccess: ({ imported }) => {
      setBackupMessage(`${imported} notes imported. Refreshing your workspace...`);
      window.setTimeout(() => window.location.reload(), 700);
    },
    onError: (error) => setBackupMessage(error.message),
  });

  const update = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    savePreferences(preferences);
    setSaved(true);
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme?.();
    update("theme", nextTheme);
    savePreferences({ ...preferences, theme: nextTheme });
  };

  const addCustomTemplate = () => {
    if (!templateTitle.trim() || !templateContent.trim()) return;
    const template: NoteTemplate = {
      id: editingTemplateId || `custom-${Date.now()}`,
      title: templateTitle.trim(),
      description: "Custom template",
      category: templateCategory,
      content: templateContent.trim(),
    };
    const next = editingTemplateId ? updateTemplate(customTemplates, template) : [...customTemplates, template];
    setCustomTemplates(next);
    saveCustomTemplates(next);
    setTemplateTitle("");
    setTemplateContent("");
    setEditingTemplateId(null);
    setTemplateSaved(true);
  };

  const startEditingTemplate = (template: NoteTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateTitle(template.title);
    setTemplateCategory(template.category);
    setTemplateContent(template.content);
    setTemplateSaved(false);
  };

  const cancelEditingTemplate = () => {
    setEditingTemplateId(null);
    setTemplateTitle("");
    setTemplateContent("");
  };

  const removeCustomTemplate = (id: string) => {
    const next = customTemplates.filter((template) => template.id !== id);
    setCustomTemplates(next);
    saveCustomTemplates(next);
  };

  const reorderCustomTemplate = (targetId: string) => {
    if (!draggedTemplateId || draggedTemplateId === targetId) return;
    const next = reorderTemplates(customTemplates, draggedTemplateId, targetId);
    setCustomTemplates(next);
    saveCustomTemplates(next);
    setDraggedTemplateId(null);
  };

  const saveExportPreset = () => {
    if (!presetName.trim()) return;
    const next = [...exportPresets.filter((preset) => preset.name !== presetName.trim()), { name: presetName.trim(), category: exportCategory, startDate: exportStartDate, endDate: exportEndDate }];
    setExportPresets(next);
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresetName("");
  };

  const applyExportPreset = (preset: ExportPreset) => {
    setExportCategory(preset.category);
    setExportStartDate(preset.startDate);
    setExportEndDate(preset.endDate);
  };

  const removeExportPreset = (name: string) => {
    const next = exportPresets.filter((preset) => preset.name !== name);
    setExportPresets(next);
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvExport = () => {
    const filtered = filterNotes(notes, { category: exportCategory, startDate: exportStartDate, endDate: exportEndDate });
    downloadFile(notesToCsv(filtered), `smartnote-notes-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    setBackupMessage(`${filtered.length} of ${notes.length} notes exported as CSV.`);
  };

  const handleMarkdownExport = () => {
    const filtered = filterNotes(notes, { category: exportCategory, startDate: exportStartDate, endDate: exportEndDate });
    downloadFile(notesToMarkdown(filtered), `smartnote-notes-${new Date().toISOString().slice(0, 10)}.md`, "text/markdown;charset=utf-8");
    setBackupMessage(`${filtered.length} of ${notes.length} notes exported as Markdown.`);
  };

  const filteredNotes = filterNotes(notes, { category: exportCategory, startDate: exportStartDate, endDate: exportEndDate });
  const markdownPreview = notesToMarkdown(filteredNotes);
  const visibleTemplates = filterTemplates(customTemplates, templateSearch, templateFilterCategory);

  const handleExport = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      notes,
      preferences,
      customTemplates,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `smartnote-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage(`${notes.length} notes and workspace settings exported.`);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { notes?: unknown; preferences?: Partial<AppPreferences>; customTemplates?: unknown };
      if (payload.preferences) {
        savePreferences({ ...loadPreferences(), ...payload.preferences });
        if (payload.preferences.theme && payload.preferences.theme !== theme) toggleTheme?.();
      }
      if (Array.isArray(payload.customTemplates)) {
        const validTemplates = payload.customTemplates.filter((template): template is NoteTemplate => {
          if (!template || typeof template !== "object") return false;
          const item = template as Partial<NoteTemplate>;
          return typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string" && categories.includes(item.category as typeof categories[number]);
        });
        saveCustomTemplates(validTemplates);
      }
      const importedNotes = Array.isArray(payload.notes) ? payload.notes.filter((note): note is Record<string, unknown> => {
        if (!note || typeof note !== "object") return false;
        const item = note as Record<string, unknown>;
        return typeof item.title === "string" && typeof item.content === "string" && categories.includes(item.category as typeof categories[number]) && ["Low", "Medium", "High"].includes(String(item.priority));
      }).map((note) => ({
        title: String(note.title),
        content: String(note.content),
        category: note.category as NoteTemplate["category"],
        priority: note.priority as "Low" | "Medium" | "High",
        isCompleted: Number(note.isCompleted) || 0,
        dueDate: typeof note.dueDate === "string" ? note.dueDate : null,
        scheduledDate: typeof note.scheduledDate === "string" ? note.scheduledDate : null,
      })) : [];
      if (importedNotes.length) importBackup.mutate({ notes: importedNotes });
      else {
        setBackupMessage("Settings and templates imported. Reload to apply them.");
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch {
      setBackupMessage("That backup file could not be read.");
    }
  };

  return (
    <BrutalistDashboard>
      <div className="min-h-screen bg-black text-white">
        <header className="border-b-2 border-white p-8 md:p-12 bg-gradient-to-br from-black via-black to-red-950/30">
          <p className="text-red-500 text-xs font-bold tracking-[0.35em] mb-4">CONTROL / 04</p>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">SETTINGS<span className="text-red-600">.</span></h1>
          <div className="h-1 bg-red-600 w-24 mt-5 mb-4" />
          <p className="text-gray-300 text-lg">Tune your capture system.</p>
        </header>

        <main className="p-8 md:p-12 space-y-10 max-w-5xl">
          <section className="border-2 border-white p-6 md:p-8">
            <p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">DISPLAY / 01</p>
            <h2 className="text-3xl font-bold mb-6">WORKSPACE DEFAULTS</h2>
            <div className="space-y-5">
              <label className="flex items-center justify-between gap-4 border-b border-white/20 pb-5"><span><strong className="block text-lg">Show stats on launch</strong><span className="text-sm text-gray-500">Keep your dashboard metrics visible.</span></span><input type="checkbox" checked={preferences.showStats} onChange={(e) => update("showStats", e.target.checked)} className="h-5 w-5 accent-red-600" /></label>
              <label className="flex items-center justify-between gap-4 border-b border-white/20 pb-5"><span><strong className="block text-lg">Hide completed notes</strong><span className="text-sm text-gray-500">Start with a focused pending queue.</span></span><input type="checkbox" checked={preferences.hideCompleted} onChange={(e) => update("hideCompleted", e.target.checked)} className="h-5 w-5 accent-red-600" /></label>
              <div className="flex flex-wrap items-center justify-between gap-4"><span><strong className="block text-lg">Default sort</strong><span className="text-sm text-gray-500">Choose the first ordering you see.</span></span><Select value={preferences.sortBy} onValueChange={(value) => update("sortBy", value as SortPreference)}><SelectTrigger className="w-48 bg-gray-950 border-2 border-white"><SelectValue /></SelectTrigger><SelectContent className="bg-gray-950 border-2 border-white text-white"><SelectItem value="date">DATE</SelectItem><SelectItem value="priority">PRIORITY</SelectItem><SelectItem value="category">CATEGORY</SelectItem></SelectContent></Select></div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-5"><span><strong className="block text-lg">Interface theme</strong><span className="text-sm text-gray-500">Switch between light and dark mode.</span></span><Button onClick={handleThemeToggle} variant="outline" className="border-2 border-white hover:bg-white hover:text-black font-bold">{theme.toUpperCase()} · SWITCH</Button></div>
            </div>
            <Button onClick={handleSave} className="mt-8 bg-red-600 hover:bg-red-500 font-bold px-8 py-3">{saved ? "SAVED" : "SAVE SETTINGS"}</Button>
          </section>

          <section className="border-2 border-white p-6 md:p-8">
            <p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">TEMPLATES / 02</p>
            <h2 className="text-3xl font-bold mb-2">CUSTOM FORMATS</h2>
            <p className="text-gray-500 mb-6">Create reusable formats beyond the 25 built-in templates.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} placeholder="Template name" className="bg-gray-950 border-2 border-white p-3 text-white placeholder-gray-600" />
              <select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value as NoteTemplate["category"])} className="bg-gray-950 border-2 border-white p-3 text-white">{categories.map((category) => <option key={category}>{category}</option>)}</select>
              <textarea value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} placeholder="Starter content" rows={3} className="bg-gray-950 border-2 border-white p-3 text-white placeholder-gray-600 md:col-span-3" />
            </div>
            <div className="flex gap-3 mt-4"><Button onClick={addCustomTemplate} className="bg-red-600 hover:bg-red-500 font-bold">{editingTemplateId ? "SAVE TEMPLATE CHANGES" : templateSaved ? "ADD ANOTHER TEMPLATE" : "SAVE CUSTOM TEMPLATE"}</Button>{editingTemplateId && <Button onClick={cancelEditingTemplate} variant="outline" className="border-white font-bold">CANCEL</Button>}</div>
            {customTemplates.length > 0 && <div className="mt-6 space-y-2"><div className="flex flex-wrap gap-3"><input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search custom templates" className="flex-1 min-w-48 bg-gray-950 border-2 border-white p-3 text-white placeholder-gray-600" /><select value={templateFilterCategory} onChange={(event) => setTemplateFilterCategory(event.target.value)} className="bg-gray-950 border-2 border-white p-3 text-white"><option>All</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><p className="text-[10px] tracking-[0.25em] text-gray-500">DRAG TO REORDER · SHOWING {visibleTemplates.length}</p>{visibleTemplates.map((template) => <div key={template.id} draggable onDragStart={() => setDraggedTemplateId(template.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderCustomTemplate(template.id)} onDragEnd={() => setDraggedTemplateId(null)} className={`flex items-center justify-between gap-4 border border-white/20 p-3 transition-opacity ${draggedTemplateId === template.id ? "opacity-40" : ""}`}><span className="flex items-center gap-3"><span aria-hidden="true" className="cursor-grab text-gray-500">⋮⋮</span><span><strong>{template.title}</strong><span className="ml-3 text-xs text-gray-500">{template.category}</span></span></span><span className="flex gap-2"><Button onClick={() => startEditingTemplate(template)} variant="outline" className="border-white text-xs">EDIT</Button><Button onClick={() => removeCustomTemplate(template.id)} variant="outline" className="border-white text-xs">REMOVE</Button></span></div>)}</div>}
          </section>

          <section className="border-2 border-white p-6 md:p-8">
            <p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">BACKUP / 03</p>
            <h2 className="text-3xl font-bold mb-2">EXPORT / IMPORT</h2>
            <p className="text-gray-500 mb-6">Back up notes, preferences, and custom templates as one JSON file, or export a filtered CSV/Markdown view.</p>
            <div className="grid gap-3 md:grid-cols-3 mb-5"><label className="text-xs tracking-widest text-gray-500">CATEGORY<select value={exportCategory} onChange={(e) => setExportCategory(e.target.value)} className="mt-2 block w-full bg-gray-950 border-2 border-white p-3 text-white"><option>All</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="text-xs tracking-widest text-gray-500">FROM<input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="mt-2 block w-full bg-gray-950 border-2 border-white p-3 text-white" /></label><label className="text-xs tracking-widest text-gray-500">TO<input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="mt-2 block w-full bg-gray-950 border-2 border-white p-3 text-white" /></label></div>
            <p className="text-xs text-gray-500 mb-4">FILTERED NOTES: {filteredNotes.length} / {notes.length}</p><div className="flex flex-wrap gap-3"><Button onClick={handleExport} className="bg-red-600 hover:bg-red-500 font-bold">EXPORT BACKUP</Button><Button onClick={handleCsvExport} variant="outline" className="border-2 border-white font-bold">EXPORT CSV</Button><Button onClick={handleMarkdownExport} variant="outline" className="border-2 border-white font-bold">EXPORT MARKDOWN</Button><Button onClick={() => setShowMarkdownPreview((value) => !value)} variant="outline" className="border-2 border-white font-bold">{showMarkdownPreview ? "HIDE PREVIEW" : "PREVIEW MARKDOWN"}</Button><Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-2 border-white font-bold">IMPORT BACKUP</Button><input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} className="hidden" /></div><div className="flex flex-wrap gap-2 mt-4"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" className="bg-gray-950 border border-white/50 p-2 text-white placeholder-gray-600" /><Button onClick={saveExportPreset} variant="outline" className="border-white text-xs">SAVE FILTER PRESET</Button>{exportPresets.map((preset) => <span key={preset.name} className="inline-flex gap-1"><Button onClick={() => applyExportPreset(preset)} variant="outline" className="border-red-600 text-xs">{preset.name}</Button><button onClick={() => removeExportPreset(preset.name)} aria-label={`Remove ${preset.name}`} className="border border-white/40 px-2 text-xs">×</button></span>)}</div>
            {showMarkdownPreview && <div className="markdown-print-preview mt-6 border-2 border-red-600 bg-white text-black p-6 max-h-[30rem] overflow-auto"><div className="flex justify-end mb-3"><Button onClick={() => window.print()} variant="outline" className="border-black text-black text-xs">PRINT PREVIEW</Button></div><pre className="whitespace-pre-wrap font-sans text-sm leading-7">{markdownPreview}</pre></div>}
            {backupMessage && <p className="mt-4 text-sm text-gray-300 border-l-2 border-red-600 pl-3">{backupMessage}</p>}
          </section>

          <section className="border-2 border-white p-6 md:p-8"><p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">CREDITS / 04</p><h2 className="text-3xl font-bold mb-5">AUTHOR INFO</h2><div className="border-l-2 border-red-600 pl-4"><p className="text-xs tracking-[0.3em] text-gray-500">DESIGNED AND BUILT BY</p><p className="text-2xl font-bold mt-1">DR SOHIL MOMIN</p><p className="text-sm text-gray-500 mt-1">SmartNote Scheduler · AI note operating system</p></div></section>

          <section className="border-2 border-white p-6 md:p-8"><p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">COMMANDS / 05</p><h2 className="text-3xl font-bold mb-5">KEYBOARD SHORTCUTS</h2><div className="grid gap-3 sm:grid-cols-2">{shortcuts.map(([key, description]) => <div key={key} className="flex items-center gap-4 border border-white/20 p-3"><kbd className="bg-white text-black px-2 py-1 text-xs font-bold whitespace-nowrap">{key}</kbd><span className="text-gray-300 text-sm">{description}</span></div>)}</div></section>
        </main>
      </div>
    </BrutalistDashboard>
  );
}
