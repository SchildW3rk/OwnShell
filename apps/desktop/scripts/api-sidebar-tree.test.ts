import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiRequestsTable } from '@ownshell/core';
import {
  filterTree,
  moveSibling,
  sortSiblingsByName,
} from '../src/components/api-client/sidebar/tree-utils';
import type { ApiCollectionTreeItem } from '../src/components/api-client/sidebar/types';

const req = (id: string, name: string, method: ApiRequestsTable['method'], url: string) =>
  ({ id, name, method, url }) as ApiRequestsTable;
const folder = (id: string, children: ApiCollectionTreeItem[], requests: ApiRequestsTable[]) =>
  ({ id, name: id, children, requests }) as ApiCollectionTreeItem;

test('filter matches name, method and URL and expands folders on the path', () => {
  const tree = [
    folder('users', [folder('admin', [], [req('r1', 'Delete user', 'DELETE', '/users/1')])], [req('r2', 'List', 'GET', '/users')]),
    folder('empty', [], [req('r3', 'Health', 'GET', '/health')]),
  ];
  const result = filterTree(tree, [req('r4', 'Login', 'POST', '/auth')], 'delete');
  assert.deepEqual(result.tree.map((n) => n.id), ['users']);
  assert.deepEqual(result.tree[0].requests, []);
  assert.deepEqual(result.tree[0].children?.[0].requests?.map((r) => r.id), ['r1']);
  assert.deepEqual([...result.expandedIds].sort(), ['admin', 'users']);
  assert.deepEqual(result.rootRequests, []);

  assert.deepEqual(filterTree(tree, [], '/HEALTH').tree.map((n) => n.id), ['empty']);
  assert.deepEqual(filterTree(tree, [req('r4', 'Login', 'POST', '/auth')], 'post').rootRequests.map((r) => r.id), ['r4']);
});

test('move up/down renumbers siblings, also with duplicate sort_order', () => {
  const siblings = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 0 },
    { id: 'c', sort_order: 0 },
  ];
  assert.deepEqual(moveSibling(siblings, 'c', -1), [
    { id: 'c', sort_order: 1 },
    { id: 'b', sort_order: 2 },
  ]);
  assert.deepEqual(moveSibling(siblings, 'a', -1), []);
  assert.deepEqual(moveSibling(siblings, 'c', 1), []);
  assert.deepEqual(moveSibling([{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }], 'a', 1), [
    { id: 'b', sort_order: 0 },
    { id: 'a', sort_order: 1 },
  ]);
});

test('sort by name is case-insensitive and numeric', () => {
  const items = [
    { id: '1', name: 'item 10', sort_order: 0 },
    { id: '2', name: 'Item 2', sort_order: 1 },
    { id: '3', name: 'alpha', sort_order: 2 },
  ];
  assert.deepEqual(sortSiblingsByName(items), [
    { id: '3', sort_order: 0 },
    { id: '1', sort_order: 2 },
  ]);
});
