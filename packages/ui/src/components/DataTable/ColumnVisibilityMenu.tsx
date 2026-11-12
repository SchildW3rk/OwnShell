import { useState, useRef, useEffect } from 'react';
import { Check, Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import { Table } from '@tanstack/react-table';

interface ColumnVisibilityMenuProps<TData> {
  table: Table<TData>;
  buttonText?: string;
}

/**
 * ColumnVisibilityMenu Component
 *
 * Dropdown menu for toggling column visibility in DataTable
 * - Shows all toggleable columns
 * - Indicates current visibility state with Eye/EyeOff icons
 * - Closes when clicking outside
 */
export function ColumnVisibilityMenu<TData>({
  table,
  buttonText = 'Columns',
}: ColumnVisibilityMenuProps<TData>) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const visibleColumns = table.getAllColumns().filter((col) => col.getCanHide());

  return (
    <div className="relative group" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded border border-border bg-secondary hover:bg-secondary/80 transition-colors"
        title={buttonText}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {/* Tooltip */}
      {!isOpen && (
        <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-popover border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {buttonText}
        </div>
      )}

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-popover shadow-lg z-50 transition-colors duration-200">
          <div className="p-2 space-y-0.5">
            {visibleColumns.map((column) => {
              const isVisible = column.getIsVisible();
              return (
                <button
                  type="button"
                  key={column.id}
                  onClick={() => column.toggleVisibility()}
                  className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer transition-colors duration-200 text-left"
                >
                  {/* Custom Checkbox */}
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isVisible
                        ? 'bg-primary border-primary'
                        : 'bg-transparent border-muted-foreground/40'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="flex-1 text-sm text-foreground truncate">
                    {(column.columnDef.meta as any)?.displayName ||
                      (typeof column.columnDef.header === 'string'
                        ? column.columnDef.header
                        : column.id)}
                  </span>
                  {isVisible ? (
                    <Eye className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
