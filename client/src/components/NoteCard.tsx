import { useState } from "react";
import { Note } from "@shared/types";
import { Trash2, Edit2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: number) => void;
  onToggleComplete: (id: number, isCompleted: number) => void;
}

const categoryColors: Record<string, string> = {
  Tasks: "bg-blue-600",
  Deadlines: "bg-red-600",
  Schedule: "bg-green-600",
  Thoughts: "bg-purple-600",
  Learning: "bg-yellow-600",
};

const priorityColors: Record<string, string> = {
  High: "bg-red-600",
  Medium: "bg-gray-700",
  Low: "bg-gray-500",
};

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onToggleComplete,
}: NoteCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      onDelete(note.id);
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const isOverdue =
    note.dueDate &&
    new Date(note.dueDate) < new Date() &&
    !note.isCompleted;

  const formatDate = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="border-2 border-white p-6 bg-black hover:bg-gray-900 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => onToggleComplete(note.id, note.isCompleted ? 0 : 1)}
                className="flex-shrink-0 text-white hover:text-red-600 transition-colors"
              >
                {note.isCompleted ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <Circle className="w-6 h-6" />
                )}
              </button>
              <h3
                className={`text-xl font-bold ${
                  note.isCompleted ? "line-through text-gray-500" : "text-white"
                }`}
              >
                {note.title}
              </h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className={`${categoryColors[note.category as keyof typeof categoryColors]} text-white px-3 py-1 text-xs font-bold`}>
                {note.category}
              </span>
              <span className={`${priorityColors[note.priority as keyof typeof priorityColors]} text-white px-3 py-1 text-xs font-bold`}>
                {note.priority}
              </span>
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <Button
              onClick={() => onEdit(note)}
              size="sm"
              variant="ghost"
              className="text-white hover:bg-gray-800"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <p className="text-gray-300 mb-4 line-clamp-3">{note.content}</p>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm">
          <div className="space-y-1">
            {note.dueDate && (
              <div className={`font-bold ${isOverdue ? "text-red-600" : "text-gray-400"}`}>
                DUE: {formatDate(note.dueDate)}
                {isOverdue && " (OVERDUE)"}
              </div>
            )}
            {note.scheduledDate && (
              <div className="text-gray-400 font-bold">
                SCHEDULED: {formatDate(note.scheduledDate)}
              </div>
            )}
          </div>
          <div className="text-gray-500 text-xs">
            {new Date(note.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteConfirm}
        title="Delete Note"
        description={`Are you sure you want to delete "${note.title}"? This cannot be undone.`}
        isLoading={isDeleting}
      />
    </>
  );
}
