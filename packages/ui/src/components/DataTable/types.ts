/**
 * DataTable Type Definitions
 */

import { ColumnDef, SortingState, ColumnFiltersState, OnChangeFn } from '@tanstack/react-table';

/**
 * Main DataTable Props Interface
 */
export interface DataTableProps<TData> {
  // ========== Data ==========
  /** Array of data rows */
  data: TData[];

  /** Column definitions (TanStack Table format) */
  columns: ColumnDef<TData>[];

  // ========== State (Controlled) ==========
  /** Sorting state (controlled) */
  sorting?: SortingState;

  /** Sorting change callback */
  onSortingChange?: OnChangeFn<SortingState>;

  /** Column filters state (controlled) */
  columnFilters?: ColumnFiltersState;

  /** Column filters change callback */
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;

  // ========== Global Search (NEW - v1.18.0) ==========
  /** Global filter value (controlled) */
  globalFilter?: string;

  /** Global filter change callback */
  onGlobalFilterChange?: OnChangeFn<string>;

  /** Enable global search across all columns (default: false) */
  enableGlobalFilter?: boolean;

  /** Placeholder text for global search input */
  globalFilterPlaceholder?: string;

  // ========== Column Visibility (NEW - v1.18.0) ==========
  /** Column visibility state (controlled) */
  columnVisibility?: Record<string, boolean>;

  /** Column visibility change callback */
  onColumnVisibilityChange?: OnChangeFn<Record<string, boolean>>;

  /** Enable column visibility toggle (default: false) */
  enableColumnVisibility?: boolean;

  /** Text for the column visibility button (default: "Columns") */
  columnVisibilityButtonText?: string;

  // ========== Pagination ==========
  /** Number of rows per page (default: 25) */
  pageSize?: number;

  /** Available page size options (default: [10, 25, 50, 100]) */
  pageSizeOptions?: number[];

  /** Page size change callback */
  onPageSizeChange?: (size: number) => void;

  /** Current page index (0-based, controlled) */
  pageIndex?: number;

  /** Page change callback */
  onPageChange?: (page: number) => void;

  /** Total number of rows (for server-side pagination) */
  totalRows?: number;

  // ========== UI States ==========
  /** Loading state (shows skeleton rows) */
  isLoading?: boolean;

  /** Message to show when data is empty */
  emptyMessage?: string;

  // ========== Styling ==========
  /** Root element className */
  className?: string;

  /** Custom colors (optional - defaults to Dark-Theme) */
  colors?: DataTableColors;

  // ========== Behavior ==========
  /** Enable column sorting (default: true) */
  enableSorting?: boolean;

  /** Enable column filtering (default: false) */
  enableFiltering?: boolean;

  /** Enable pagination (default: true) */
  enablePagination?: boolean;

  /** Make header sticky (default: true) */
  stickyHeader?: boolean;

  /** Enable zebra striping for better readability (default: true) */
  enableStriped?: boolean;

  // ========== Custom Toolbar Elements (NEW - v1.19.0) ==========
  /** Custom element to render on the left side of toolbar (before search) */
  toolbarLeft?: React.ReactNode;

  /** Custom element to render on the right side of toolbar (after columns toggle) */
  toolbarRight?: React.ReactNode;
}

/**
 * Color customization interface
 */
export interface DataTableColors {
  /** Header background color */
  headerBg?: string;

  /** Header text color */
  headerText?: string;

  /** Header border color */
  headerBorder?: string;

  /** Row background color (normal) */
  rowBg?: string;

  /** Row background color (even - for striped rows) */
  rowBgEven?: string;

  /** Row background color on hover */
  rowHoverBg?: string;

  /** Row text color */
  rowText?: string;

  /** Border color */
  border?: string;

  /** Pagination background color */
  paginationBg?: string;

  /** Pagination text color */
  paginationText?: string;

  /** Pagination active button background */
  paginationActiveBg?: string;
}
