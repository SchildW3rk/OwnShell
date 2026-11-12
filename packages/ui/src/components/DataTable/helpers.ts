/**
 * DataTable Helper Functions
 */

/**
 * Calculate pagination info text
 *
 * @example
 * getPaginationInfo(0, 50, 200) // Returns: "1-50 of 200"
 */
export function getPaginationInfo(pageIndex: number, pageSize: number, totalRows: number): string {
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);
  return `${start}-${end} of ${totalRows}`;
}

/**
 * Calculate total number of pages
 */
export function getTotalPages(totalRows: number, pageSize: number): number {
  return Math.ceil(totalRows / pageSize);
}

/**
 * Get page numbers to display in pagination
 * Shows: [1] ... [4] [5] [6] ... [10]
 *
 * @param currentPage Current page (1-indexed)
 * @param totalPages Total number of pages
 * @param maxVisible Maximum number of page buttons to show
 * @returns Array of page numbers (or null for ellipsis)
 */
export function getVisiblePages(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | null)[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | null)[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  let startPage = Math.max(2, currentPage - halfVisible);
  let endPage = Math.min(totalPages - 1, currentPage + halfVisible);

  // Adjust if near start
  if (currentPage <= halfVisible + 1) {
    endPage = maxVisible - 1;
  }

  // Adjust if near end
  if (currentPage >= totalPages - halfVisible) {
    startPage = totalPages - maxVisible + 2;
  }

  // Add ellipsis after first page if needed
  if (startPage > 2) {
    pages.push(null); // Ellipsis
  }

  // Add middle pages
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (endPage < totalPages - 1) {
    pages.push(null); // Ellipsis
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}
