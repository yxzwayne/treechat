import { useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

interface Branch {
  id: string;
  messageId: string;
  title: string;
}

interface BranchNavigatorProps {
  branches: Branch[];
  currentBranchId?: string;
  onSelectBranch: (branchId: string) => void;
}

export function BranchNavigator({
  branches,
  currentBranchId,
  onSelectBranch,
}: BranchNavigatorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  
  if (branches.length <= 1) {
    return null;
  }
  
  const currentIndex = branches.findIndex(branch => branch.id === currentBranchId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < branches.length - 1 && currentIndex !== -1;
  
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10">
      <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 backdrop-blur dark:bg-neutral-900/80 border shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!hasPrevious}
          onClick={() => onSelectBranch(branches[currentIndex - 1].id)}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Previous branch</span>
        </Button>
        
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>Branch {currentIndex + 1}/{branches.length}</span>
          </Button>
          
          {showDropdown && (
            <div className="absolute bottom-full left-0 mb-2 w-48 rounded-md border bg-background shadow-md">
              <div className="p-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Branches
              </div>
              <div className="max-h-[12rem] overflow-auto">
                {branches.map((branch, index) => (
                  <button
                    key={branch.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800",
                      branch.id === currentBranchId && "bg-neutral-100 dark:bg-neutral-800"
                    )}
                    onClick={() => {
                      onSelectBranch(branch.id);
                      setShowDropdown(false);
                    }}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {branch.title || `Branch ${index + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!hasNext}
          onClick={() => onSelectBranch(branches[currentIndex + 1].id)}
        >
          <ArrowRight className="h-4 w-4" />
          <span className="sr-only">Next branch</span>
        </Button>
      </div>
    </div>
  );
}