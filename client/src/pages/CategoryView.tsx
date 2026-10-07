import { useRoute } from "wouter";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BrutalistDashboard } from "@/components/BrutalistDashboard";
import { NoteCard } from "@/components/NoteCard";
import { EditNoteDialog } from "@/components/EditNoteDialog";
import { NoteFilters } from "@/components/NoteFilters";
import { Loader2 } from "lucide-react";
import { NoteCategory } from "@shared/types";

export default function CategoryView() {
  const { user } = useAuth();
  const [match, params] = useRoute("/category/:category");

  const category = params?.category as NoteCategory | undefined;
  const [editingNote, setEditingNote] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");

  // Queries
  const { data: notes = [], isLoading, refetch } = trpc.notes.listByCategory.useQuery(
    { category: category || "Tasks" },
    { enabled: !!category }
  );

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

  if (!user || !category) return null;

  const categoryInfo: Record<NoteCategory, { icon: string; color: string; description: string }> = {
    Tasks: {
      icon: "✓",
      color: "bg-blue-600",
      description: "Action items and todos",
    },
    Deadlines: {
      icon: "⏰",
      color: "bg-red-600",
      description: "Time-sensitive deliverables",
    },
    Schedule: {
      icon: "📅",
      color: "bg-green-600",
      description: "Appointments and events",
    },
    Thoughts: {
      icon: "💭",
      color: "bg-purple-600",
      description: "Ideas and reflections",
    },
    Learning: {
      icon: "📚",
      color: "bg-yellow-600",
      description: "Knowledge and insights",
    },
  };

  const info = categoryInfo[category];

  return (
    <BrutalistDashboard currentCategory={category}>
      <div className="bg-black text-white min-h-screen">
        {/* Header */}
        <div className="border-b-2 border-white p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className={`${info.color} w-12 h-12 flex items-center justify-center text-white font-bold text-2xl`}>
              {info.icon}
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-bold">{category.toUpperCase()}</h1>
              <p className="text-gray-400 text-lg">{info.description}</p>
            </div>
          </div>
          <div className="h-1 bg-red-600 w-24"></div>
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
          <h2 className="text-2xl font-bold mb-6">
            {filteredAndSortedNotes.length} {filteredAndSortedNotes.length === 1 ? "NOTE" : "NOTES"}
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
          ) : filteredAndSortedNotes.length === 0 ? (
            <div className="border-2 border-white p-12 text-center">
              <p className="text-gray-400 text-lg font-bold">NO NOTES IN THIS CATEGORY</p>
              <p className="text-gray-500">Create a note to get started</p>
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
