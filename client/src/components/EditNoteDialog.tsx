import { useState, useEffect } from "react";
import { Note } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface EditNoteDialogProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    content: string;
    priority: "Low" | "Medium" | "High";
  }) => Promise<void>;
  isLoading?: boolean;
}

export function EditNoteDialog({
  note,
  open,
  onOpenChange,
  onSave,
  isLoading = false,
}: EditNoteDialogProps) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">(
    note?.priority || "Medium"
  );

  // Sync form state when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setPriority(note.priority);
    }
  }, [note?.id, open]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    await onSave({ title, content, priority });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border-2 border-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl font-bold">
            EDIT NOTE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-gray-400 mb-2 block">
              TITLE
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-gray-900 border-2 border-white text-white placeholder-gray-500"
              placeholder="Note title"
            />
          </div>

          <div>
            <label className="text-xs font-bold tracking-widest text-gray-400 mb-2 block">
              CONTENT
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="bg-gray-900 border-2 border-white text-white placeholder-gray-500"
              placeholder="Note content"
              rows={6}
            />
          </div>

          <div>
            <label className="text-xs font-bold tracking-widest text-gray-400 mb-2 block">
              PRIORITY
            </label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger className="bg-gray-900 border-2 border-white text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-2 border-white">
                <SelectItem value="Low" className="text-white">
                  Low
                </SelectItem>
                <SelectItem value="Medium" className="text-white">
                  Medium
                </SelectItem>
                <SelectItem value="High" className="text-white">
                  High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex gap-4 justify-end">
          <Button
            onClick={() => {
              onOpenChange(false);
              setTitle("");
              setContent("");
              setPriority("Medium");
            }}
            variant="outline"
            className="border-2 border-white text-white hover:bg-gray-900 font-bold"
            disabled={isLoading}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim() || isLoading}
            className="bg-red-600 hover:bg-red-700 text-white font-bold"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                SAVING
              </>
            ) : (
              "SAVE"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
