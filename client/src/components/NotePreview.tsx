import { Loader2 } from "lucide-react";

interface NotePreviewProps {
  isAnalyzing: boolean;
  preview?: {
    category: string;
    priority: string;
    title: string;
    extractedDate?: string;
  };
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

export function NotePreview({ isAnalyzing, preview }: NotePreviewProps) {
  if (!isAnalyzing && !preview) return null;

  return (
    <div className="border-2 border-red-600 p-4 bg-gray-900 mt-4">
      <p className="text-xs font-bold tracking-widest text-red-600 mb-3">AI PREVIEW</p>
      
      {isAnalyzing ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-bold">ANALYZING...</span>
        </div>
      ) : preview ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-gray-400 mb-1">TITLE</p>
            <p className="text-white font-bold">{preview.title}</p>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">CATEGORY</p>
              <span className={`${categoryColors[preview.category as keyof typeof categoryColors]} text-white px-3 py-1 text-xs font-bold inline-block`}>
                {preview.category}
              </span>
            </div>
            
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">PRIORITY</p>
              <span className={`${priorityColors[preview.priority as keyof typeof priorityColors]} text-white px-3 py-1 text-xs font-bold inline-block`}>
                {preview.priority}
              </span>
            </div>
          </div>

          {preview.extractedDate && (
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">DETECTED DATE</p>
              <p className="text-white font-bold text-sm">{preview.extractedDate}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
