import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BrutalistDashboard } from "@/components/BrutalistDashboard";
import { NoteCard } from "@/components/NoteCard";
import { NotePreview } from "@/components/NotePreview";
import { EditNoteDialog } from "@/components/EditNoteDialog";
import { NoteFilters } from "@/components/NoteFilters";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { loadCustomTemplates, noteTemplates } from "@/data/noteTemplates";
import { loadPreferences } from "@/lib/preferences";

export default function Home() {
  const { user } = useAuth();
  const [noteContent, setNoteContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [showStats, setShowStats] = useState(() => loadPreferences().showStats);
  const [preview, setPreview] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(() => loadPreferences().hideCompleted);
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">(() => loadPreferences().sortBy);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [customTemplates, setCustomTemplates] = useState(() => loadCustomTemplates());
  const allTemplates = useMemo(() => [...noteTemplates, ...customTemplates], [customTemplates]);

  useEffect(() => {
    const syncTemplates = () => setCustomTemplates(loadCustomTemplates());
    window.addEventListener("smartnote-templates-changed", syncTemplates);
    return () => window.removeEventListener("smartnote-templates-changed", syncTemplates);
  }, []);

  // Queries
  const { data: notes = [], isLoading, refetch } = trpc.notes.list.useQuery();
  const { data: stats } = trpc.notes.stats.useQuery();

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Tasks: 0,
      Deadlines: 0,
      Schedule: 0,
      Thoughts: 0,
      Learning: 0,
    };
    notes.forEach((note) => {
      if (note.category in counts) {
        counts[note.category]++;
      }
    });
    return counts;
  }, [notes]);

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes;

    // Apply hide completed filter
    if (hideCompleted) {
      filtered = filtered.filter((note) => !note.isCompleted);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        const dateA = a.dueDate || a.scheduledDate || a.createdAt;
        const dateB = b.dueDate || b.scheduledDate || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      } else if (sortBy === "priority") {
        const priorityOrder = { High: 0, Medium: 1, Low: 2 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      } else {
        // category
        return a.category.localeCompare(b.category);
      }
    });

    return sorted;
  }, [notes, hideCompleted, sortBy]);

  // Mutations
  const createNoteMutation = trpc.notes.create.useMutation({
    onSuccess: () => {
      setNoteContent("");
      setPreview(null);
      refetch();
    },
  });

  const deleteNoteMutation = trpc.notes.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const toggleCompleteMutation = trpc.notes.toggleComplete.useMutation({
    onSuccess: () => refetch(),
  });

  const updateNoteMutation = trpc.notes.updateNote.useMutation({
    onSuccess: () => {
      setEditingNote(null);
      setIsEditDialogOpen(false);
      refetch();
    },
  });

  // Simulate AI analysis for preview
  const handleContentChange = (value: string) => {
    setNoteContent(value);
    
    // Show preview after 500ms of typing
    if (value.trim().length > 10) {
      setIsAnalyzing(true);
      setTimeout(() => {
        // Mock preview - in real app this would call the AI
        const mockCategories = ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"];
        const mockPriorities = ["Low", "Medium", "High"];
        const randomCategory = mockCategories[Math.floor(Math.random() * mockCategories.length)];
        const randomPriority = mockPriorities[Math.floor(Math.random() * mockPriorities.length)];
        
        setPreview({
          category: randomCategory,
          priority: randomPriority,
          title: value.substring(0, 50) || "Untitled",
          extractedDate: value.includes("tomorrow") ? "Tomorrow" : undefined,
        });
        setIsAnalyzing(false);
      }, 800);
    } else {
      setPreview(null);
      setIsAnalyzing(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) return;
    setIsSubmitting(true);
    try {
      await createNoteMutation.mutateAsync({ content: noteContent });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = allTemplates.find((item) => item.id === templateId);
    if (template) handleContentChange(template.content);
  };

  useEffect(() => {
    const handleComposerShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && noteContent.trim()) {
        event.preventDefault();
        void handleCreateNote();
      }
    };
    window.addEventListener("keydown", handleComposerShortcut);
    return () => window.removeEventListener("keydown", handleComposerShortcut);
  }, [noteContent]);

  const handleEditNote = (note: any) => {
    setEditingNote(note);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (data: any) => {
    if (!editingNote) return;
    await updateNoteMutation.mutateAsync({
      id: editingNote.id,
      ...data,
    });
  };

  if (!user) return null;

  return (
    <BrutalistDashboard categoryCounts={categoryCounts}>
      <div className="bg-black text-white min-h-screen">
        {/* Header */}
        <div className="relative overflow-hidden border-b-2 border-white p-8 md:p-12 bg-gradient-to-br from-black via-black to-red-950/30">
          <div className="absolute -right-12 -top-16 text-[10rem] md:text-[16rem] font-bold leading-none text-white/[0.03] select-none" aria-hidden="true">01</div>
          <div className="relative">
            <p className="text-red-500 text-xs font-bold tracking-[0.35em] mb-4">AI NOTE OPERATING SYSTEM</p>
            <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">CAPTURE<span className="text-red-600">.</span></h1>
            <div className="h-1 bg-red-600 w-24 mb-4"></div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-gray-300 text-lg">Turn raw thoughts into organized action.</p>
              <span className="text-[10px] font-bold tracking-[0.25em] text-gray-500">AUTHOR / DR SOHIL MOMIN</span>
            </div>
          </div>
        </div>

        {/* Stats Widget */}
        {showStats && stats && (
          <div className="border-b-2 border-white p-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="surface-brutalist p-4 transition-transform hover:-translate-y-1">
                <p className="text-xs font-bold tracking-widest text-gray-400">TOTAL</p>
                <p className="text-4xl font-bold">{stats.total}</p>
              </div>
              <div className="surface-brutalist p-4 transition-transform hover:-translate-y-1">
                <p className="text-xs font-bold tracking-widest text-gray-400">COMPLETED</p>
                <p className="text-4xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <div className="surface-brutalist p-4 transition-transform hover:-translate-y-1">
                <p className="text-xs font-bold tracking-widest text-gray-400">PENDING</p>
                <p className="text-4xl font-bold text-blue-600">{stats.pending}</p>
              </div>
              <div className="surface-brutalist p-4 transition-transform hover:-translate-y-1">
                <p className="text-xs font-bold tracking-widest text-gray-400">OVERDUE</p>
                <p className="text-4xl font-bold text-red-600">{stats.overdue}</p>
              </div>
            </div>
            <Button
              onClick={() => setShowStats(false)}
              variant="ghost"
              className="text-gray-400 hover:text-white text-xs"
            >
              HIDE STATS
            </Button>
          </div>
        )}

        {/* Input Section */}
        <div className="border-b-2 border-white p-8 md:p-12 bg-white/[0.02]">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <p className="text-red-500 text-xs font-bold tracking-[0.3em] mb-2">INPUT / 01</p>
              <h2 className="text-3xl font-bold">NEW NOTE</h2>
            </div>
            <p className="text-xs text-gray-500 tracking-widest">NATURAL LANGUAGE ENABLED</p>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="note-template" className="text-xs font-bold tracking-[0.25em] text-gray-500">START FROM TEMPLATE</label>
              <select id="note-template" value={selectedTemplate} onChange={(event) => handleTemplateChange(event.target.value)} className="focus-brutal bg-gray-950 border border-white/40 px-3 py-2 text-sm text-white min-w-56">
                <option value="">Blank note</option>
                {allTemplates.map((template) => <option key={template.id} value={template.id}>{template.title} · {template.category}</option>)}
              </select>
              <span className="text-[10px] tracking-widest text-gray-600">{allTemplates.length} FORMATS</span>
            </div>
            <Textarea
              id="note-composer"
              value={noteContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Type anything... AI will auto-categorize it"
              className="focus-brutal bg-gray-950 border-2 border-white text-white placeholder-gray-500 p-4 font-mono min-h-32 transition-colors focus:border-red-600"
              rows={4}
            />
            <NotePreview isAnalyzing={isAnalyzing} preview={preview} />
            <div className="flex gap-4">
              <Button
                onClick={handleCreateNote}
                disabled={!noteContent.trim() || isSubmitting}
                className="focus-brutal bg-red-600 hover:bg-red-500 text-white font-bold px-8 py-3 shadow-[4px_4px_0_rgba(255,255,255,0.7)] hover:shadow-[2px_2px_0_rgba(255,255,255,0.7)] transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    PROCESSING
                  </>
                ) : (
                  "CREATE NOTE"
                )}
              </Button>
              <Button
                onClick={() => {
                  setNoteContent("");
                  setPreview(null);
                  setSelectedTemplate("");
                }}
                variant="outline"
                className="focus-brutal border-2 border-white text-white hover:bg-white hover:text-black font-bold px-6 py-3 transition-colors"
              >
                CLEAR
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-8 border-b-2 border-white">
          <NoteFilters
            hideCompleted={hideCompleted}
            onHideCompletedChange={setHideCompleted}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>

        {/* Notes List */}
        <div className="p-8">
          <h2 className="text-3xl font-bold mb-6">
            ALL NOTES {filteredAndSortedNotes.length > 0 && `(${filteredAndSortedNotes.length})`}
          </h2>
          <div className="h-1 bg-red-600 w-24 mb-8"></div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
          ) : filteredAndSortedNotes.length === 0 ? (
            <div className="border-2 border-white p-12 text-center">
              <p className="text-gray-400 text-lg font-bold">NO NOTES YET</p>
              <p className="text-gray-500">Start by typing something above</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAndSortedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={handleEditNote}
                  onDelete={(id) => deleteNoteMutation.mutate({ id })}
                  onToggleComplete={(id, isCompleted) =>
                    toggleCompleteMutation.mutate({ id, isCompleted })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <EditNoteDialog
        note={editingNote}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveEdit}
        isLoading={updateNoteMutation.isPending}
      />
    </BrutalistDashboard>
  );
}
