import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface NoteFiltersProps {
  hideCompleted: boolean;
  onHideCompletedChange: (hide: boolean) => void;
  sortBy: "date" | "priority" | "category";
  onSortChange: (sort: "date" | "priority" | "category") => void;
}

export function NoteFilters({
  hideCompleted,
  onHideCompletedChange,
  sortBy,
  onSortChange,
}: NoteFiltersProps) {
  return (
    <div className="border-2 border-white p-4 bg-gray-900 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onHideCompletedChange(!hideCompleted)}
          variant={hideCompleted ? "default" : "outline"}
          className={`font-bold ${
            hideCompleted
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "border-2 border-white text-white hover:bg-gray-800"
          }`}
        >
          {hideCompleted ? (
            <>
              <EyeOff className="w-4 h-4 mr-2" />
              HIDE COMPLETED
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              SHOW ALL
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <p className="text-xs font-bold tracking-widest text-gray-400 w-full">SORT BY</p>
        <Button
          onClick={() => onSortChange("date")}
          variant={sortBy === "date" ? "default" : "outline"}
          className={`font-bold text-sm ${
            sortBy === "date"
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "border-2 border-white text-white hover:bg-gray-800"
          }`}
        >
          DATE
        </Button>
        <Button
          onClick={() => onSortChange("priority")}
          variant={sortBy === "priority" ? "default" : "outline"}
          className={`font-bold text-sm ${
            sortBy === "priority"
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "border-2 border-white text-white hover:bg-gray-800"
          }`}
        >
          PRIORITY
        </Button>
        <Button
          onClick={() => onSortChange("category")}
          variant={sortBy === "category" ? "default" : "outline"}
          className={`font-bold text-sm ${
            sortBy === "category"
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "border-2 border-white text-white hover:bg-gray-800"
          }`}
        >
          CATEGORY
        </Button>
      </div>
    </div>
  );
}
