/**
 * DataTable Component
 *
 * A powerful, reusable table component built on TanStack Table
 *
 * Features:
 * - Sorting (client-side)
 * - Pagination
 * - Column filtering (optional)
 * - Custom cell renderers
 * - Loading states (skeleton)
 * - Empty states
 * - Sticky header
 * - Zebra striping
 * - Props-based styling with Dark-Theme defaults
 */

import { useMemo, useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from 'lucide-react';
import { DataTableProps, DataTableColors } from './types';
import { getPaginationInfo, getTotalPages, getVisiblePages } from './helpers';
import { Button } from '../Button';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

/**
 * Default Theme-aware colors using CSS variables
 * Compatible with Dark/Light mode
 */
const defaultColors: Required<DataTableColors> = {
  headerBg: 'bg-background',
  headerText: 'text-muted-foreground',
  headerBorder: 'border-border',
  rowBg: 'bg-transparent',
  rowBgEven: 'bg-secondary/30',
  rowHoverBg: 'hover:bg-secondary/50',
  rowText: 'text-foreground',
  border: 'border-border',
  paginationBg: 'bg-background',
  paginationText: 'text-muted-foreground',
  paginationActiveBg: 'bg-secondary',
};

/**
 * DataTable Component
 */
export function DataTable<TData>({
  data,
  columns,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  enableGlobalFilter = false,
  globalFilterPlaceholder = 'Search...',
  columnVisibility,
  onColumnVisibilityChange,
  enableColumnVisibility = false,
  columnVisibilityButtonText = 'Columns',
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
  pageIndex = 0,
  onPageChange,
  totalRows,
  isLoading = false,
  emptyMessage = 'No data found',
  className = '',
  colors = {},
  enableSorting = true,
  enableFiltering = false,
  enablePagination = true,
  stickyHeader = true,
  enableStriped = true,
  toolbarLeft,
  toolbarRight,
}: DataTableProps<TData>) {
  // Merge custom colors with defaults
  const mergedColors = { ...defaultColors, ...colors };

  // Calculate total rows
  const actualTotalRows = totalRows ?? data.length;

  // Local state for search input (not debounced)
  const [searchInput, setSearchInput] = useState(globalFilter ?? '');

  // Debounced search value (300ms delay)
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Sync debounced value to parent
  useEffect(() => {
    if (enableGlobalFilter && onGlobalFilterChange) {
      onGlobalFilterChange(debouncedSearch);
    }
  }, [debouncedSearch, enableGlobalFilter, onGlobalFilterChange]);

  // Initialize table instance
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering || enableGlobalFilter ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    onSortingChange: enableSorting && onSortingChange ? onSortingChange : undefined,
    onColumnFiltersChange:
      enableFiltering && onColumnFiltersChange ? onColumnFiltersChange : undefined,
    onGlobalFilterChange:
      enableGlobalFilter && onGlobalFilterChange ? onGlobalFilterChange : undefined,
    onColumnVisibilityChange:
      enableColumnVisibility && onColumnVisibilityChange ? onColumnVisibilityChange : undefined,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      pagination: enablePagination
        ? {
            pageIndex,
            pageSize,
          }
        : undefined,
    },
    manualPagination: !!onPageChange, // Server-side pagination if callback provided
    pageCount: onPageChange ? getTotalPages(actualTotalRows, pageSize) : undefined,
  });

  // Get pagination info
  const totalPages = getTotalPages(actualTotalRows, pageSize);
  const currentPage = pageIndex + 1; // Convert to 1-indexed
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  );

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      table.setPageIndex(newPage);
    }
  };

  // Skeleton rows for loading state
  const skeletonRows = Array.from({ length: Math.min(pageSize, 10) }, (_, i) => i);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Toolbar with Global Search + Column Visibility + Custom Elements */}
      {(enableGlobalFilter || enableColumnVisibility || toolbarLeft || toolbarRight) && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-background">
          {/* Left side: Search first, then custom left element (count) */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Global Search */}
            {enableGlobalFilter && (
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={globalFilterPlaceholder}
                  className="w-full rounded border border-border bg-secondary pl-10 pr-10 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-200"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Custom Left Element (e.g., count badge) */}
            {toolbarLeft}
          </div>

          {/* Right side: Custom right element + Column Visibility */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Custom Right Element (e.g., Add button) */}
            {toolbarRight}

            {/* Column Visibility Menu */}
            {enableColumnVisibility && (
              <ColumnVisibilityMenu table={table} buttonText={columnVisibilityButtonText} />
            )}
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        <table className="w-full text-sm">
          {/* Header */}
          <thead className={`${stickyHeader ? 'sticky top-0 z-10' : ''} ${mergedColors.headerBg}`}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-3 text-left text-xs font-semibold ${mergedColors.headerText} border-b ${mergedColors.headerBorder} whitespace-nowrap`}
                      style={{ width: header.column.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-2 ${canSort ? 'cursor-pointer select-none' : ''}`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-muted-foreground">
                              {isSorted === 'asc' && <ChevronUp className="h-4 w-4" />}
                              {isSorted === 'desc' && <ChevronDown className="h-4 w-4" />}
                              {!isSorted && <ChevronUp className="h-4 w-4 opacity-30" />}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody>
            {isLoading ? (
              // Loading skeleton
              skeletonRows.map((i) => (
                <tr key={`skeleton-${i}`} className={`border-b ${mergedColors.border}`}>
                  {columns.map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-3">
                      <div className="h-4 bg-secondary rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              // Empty state
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              // Data rows
              table.getRowModel().rows.map((row, rowIndex) => {
                const isEven = rowIndex % 2 === 0;
                const rowBgClass =
                  enableStriped && isEven ? mergedColors.rowBgEven : mergedColors.rowBg;

                return (
                  <tr
                    key={row.id}
                    className={`border-b ${mergedColors.border} ${rowBgClass} ${mergedColors.rowHoverBg} transition-colors`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`px-3 py-3 ${mergedColors.rowText}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {enablePagination && !isLoading && data.length > 0 && (
        <div
          className={`flex items-center justify-between px-4 py-3 border-t ${mergedColors.border} ${mergedColors.paginationBg}`}
        >
          {/* Left Side: Page Size Selector + Pagination Info */}
          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className={`rounded border ${mergedColors.border} bg-secondary px-2 py-1 text-sm ${mergedColors.paginationText} hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-200`}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className={`text-sm ${mergedColors.paginationText}`}>entries</span>
              </div>
            )}

            {/* Pagination Info */}
            <div className={`text-sm ${mergedColors.paginationText}`}>
              {getPaginationInfo(pageIndex, pageSize, actualTotalRows)}
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-2">
            {/* First Page */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(0)}
              disabled={pageIndex === 0}
              className="px-2"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            {/* Previous Page */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(pageIndex - 1)}
              disabled={pageIndex === 0}
              className="px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page Numbers */}
            {visiblePages.map((page, idx) => {
              if (page === null) {
                return (
                  <span key={`ellipsis-${idx}`} className={`px-2 ${mergedColors.paginationText}`}>
                    ...
                  </span>
                );
              }

              const isActive = page === currentPage;
              return (
                <Button
                  key={page}
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  className={`px-3 ${isActive ? mergedColors.paginationActiveBg : ''}`}
                >
                  {page}
                </Button>
              );
            })}

            {/* Next Page */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(pageIndex + 1)}
              disabled={pageIndex >= totalPages - 1}
              className="px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Last Page */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(totalPages - 1)}
              disabled={pageIndex >= totalPages - 1}
              className="px-2"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
