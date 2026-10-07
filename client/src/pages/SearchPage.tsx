import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BrutalistDashboard } from "@/components/BrutalistDashboard";
import { NoteCard } from "@/components/NoteCard";
import { EditNoteDialog } from "@/components/EditNoteDialog";
import { NoteFilters } from "@/components/NoteFilters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

export default function SearchPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");

  // Queries
  const { data: results = [], isLoading, refetch } = trpc.notes.search.useQuery(
    { query: searchQuery },
    { enabled: false }
  );

  // Filter and sort notes
  const filteredAndSortedResults = useMemo(() => {
    let filtered = results;

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
  }, [results, hideCompleted, sortBy]);

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

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      setHasSearched(true);
      await refetch();
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setHasSearched(false);
  };

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
    <BrutalistDashboard>
      <div className="bg-black text-white min-h-screen">
        {/* Header */}
        <div className="border-b-2 border-white p-8">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">SEARCH</h1>
          <div className="h-1 bg-red-600 w-24 mb-4"></div>
          <p className="text-gray-400 text-lg">Find notes by title or content</p>
        </div>

        {/* Search Input */}
        <div className="border-b-2 border-white p-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search notes..."
              className="bg-gray-900 border-2 border-white text-white placeholder-gray-500 p-4 flex-1"
            />
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "SEARCH"
              )}
            </Button>
            {hasSearched && (
              <Button
                onClick={handleClear}
                variant="outline"
                className="border-2 border-white text-white hover:bg-gray-900 font-bold"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        {hasSearched && (
          <div className="p-8 border-b-2 border-white">
            <NoteFilters
              hideCompleted={hideCompleted}
              onHideCompletedChange={setHideCompleted}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </div>
        )}

        {/* Results */}
        <div className="p-8">
          {!hasSearched ? (
            <div className="border-2 border-white p-12 text-center">
              <p className="text-gray-400 text-lg font-bold">START SEARCHING</p>
              <p className="text-gray-500">Enter a query to find notes</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
          ) : filteredAndSortedResults.length === 0 ? (
            <div className="border-2 border-white p-12 text-center">
              <p className="text-gray-400 text-lg font-bold">NO RESULTS FOUND</p>
              <p className="text-gray-500">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-6">
                {filteredAndSortedResults.length} {filteredAndSortedResults.length === 1 ? "RESULT" : "RESULTS"}
              </h2>
              {filteredAndSortedResults.map((note) => (
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
