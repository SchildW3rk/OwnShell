/**
 * Vault Table Utilities
 *
 * Shared column definitions and helpers for CredentialsTable and EnvironmentsTable.
 */

import { Star } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface FavoriteRow {
  id: string;
  favorite: number;
}

/**
 * Creates a reusable favorite star column definition.
 *
 * Both CredentialsTable and EnvironmentsTable use an identical star toggle column.
 * This helper avoids duplicating that definition.
 */
export function createFavoriteColumn<T extends FavoriteRow>(
  onToggleFavorite: (id: string, currentFavorite: number) => void,
  options?: { enableHiding?: boolean }
): ColumnDef<T> {
  return {
    id: 'favorite',
    header: '',
    accessorKey: 'favorite',
    enableSorting: true,
    enableHiding: options?.enableHiding,
    size: 50,
    cell: ({ row }) => (
      <button
        onClick={() => onToggleFavorite(row.original.id, row.original.favorite)}
        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-yellow-400 transition-colors duration-200"
      >
        <Star
          className={`h-4 w-4 ${row.original.favorite ? 'fill-yellow-400 text-yellow-400' : ''}`}
        />
      </button>
    ),
  };
}
