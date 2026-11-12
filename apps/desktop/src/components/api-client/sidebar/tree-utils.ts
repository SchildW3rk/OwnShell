import type { ApiRequestsTable } from '@ownshell/core';
import type { ApiCollectionTreeItem } from './types';

export function requestMatches(request: ApiRequestsTable, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [request.name, request.method, request.url].some((field) => field.toLowerCase().includes(needle));
}

/**
 * Keeps only requests matching the query and the folders that lead to them.
 * `expandedIds` are those folders, so every match is visible.
 */
export function filterTree(
  tree: ApiCollectionTreeItem[],
  rootRequests: ApiRequestsTable[],
  query: string
): { tree: ApiCollectionTreeItem[]; rootRequests: ApiRequestsTable[]; expandedIds: Set<string> } {
  const expandedIds = new Set<string>();
  const filterNode = (node: ApiCollectionTreeItem): ApiCollectionTreeItem | null => {
    const children = (node.children ?? []).map(filterNode).filter((child) => child !== null);
    const requests = (node.requests ?? []).filter((request) => requestMatches(request, query));
    if (children.length === 0 && requests.length === 0) return null;
    expandedIds.add(node.id);
    return { ...node, children, requests };
  };
  return {
    tree: tree.map(filterNode).filter((node) => node !== null),
    rootRequests: rootRequests.filter((request) => requestMatches(request, query)),
    expandedIds,
  };
}

type Ordered = { id: string; sort_order: number };

/** New sort_order values (0..n-1) for `ordered`; only the ones that change. */
function renumber(ordered: Ordered[]): Array<{ id: string; sort_order: number }> {
  return ordered
    .map((item, index) => ({ id: item.id, sort_order: index, changed: item.sort_order !== index }))
    .filter((item) => item.changed)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

/** Moves `id` one step up (-1) or down (+1) among its siblings, in displayed order. */
export function moveSibling(siblings: Ordered[], id: string, delta: -1 | 1) {
  const index = siblings.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= siblings.length) return [];
  const ordered = [...siblings];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return renumber(ordered);
}

export function sortSiblingsByName<T extends Ordered & { name: string }>(siblings: T[]) {
  return renumber(
    [...siblings].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  );
}
