import { v4 as uuidv4 } from 'uuid';
import type {
  Database,
  TransferHistoryTable,
  TransferQueueTable,
  TransferStatus,
  TransferType,
} from '@ownshell/core';
import type { Kysely } from 'kysely';
import * as path from 'path';
import type { QueueTransferInput, TransferItem } from './types';

export async function insertTransfer(
  db: Kysely<Database>,
  params: QueueTransferInput
): Promise<string> {
  const item = createQueueRecord(params, params.priority ?? 0);
  await db.insertInto('transfer_queue').values(item).execute();
  return item.id;
}

export async function insertTransfers(
  db: Kysely<Database>,
  items: QueueTransferInput[]
): Promise<string[]> {
  const now = Date.now();
  const ids: string[] = [];
  const queueItems = items.map((item, index) => {
    const record = createQueueRecord(item, items.length - index, now);
    ids.push(record.id);
    return record;
  });

  if (queueItems.length > 0) {
    await db.insertInto('transfer_queue').values(queueItems).execute();
  }

  return ids;
}

export async function pauseTransferRecord(
  db: Kysely<Database>,
  transferId: string
): Promise<void> {
  await db
    .updateTable('transfer_queue')
    .set({ status: 'paused' })
    .where('id', '=', transferId)
    .where('status', 'in', ['pending', 'active'])
    .execute();
}

export async function resumeTransferRecord(
  db: Kysely<Database>,
  transferId: string
): Promise<void> {
  await db
    .updateTable('transfer_queue')
    .set({ status: 'pending' })
    .where('id', '=', transferId)
    .where('status', '=', 'paused')
    .execute();
}

export async function getTransfer(
  db: Kysely<Database>,
  transferId: string
): Promise<TransferQueueTable | undefined> {
  return db.selectFrom('transfer_queue').selectAll().where('id', '=', transferId).executeTakeFirst();
}

export async function deleteTransfer(db: Kysely<Database>, transferId: string): Promise<void> {
  await db.deleteFrom('transfer_queue').where('id', '=', transferId).execute();
}

export async function getTransfersByHost(
  db: Kysely<Database>,
  hostId: string
): Promise<TransferQueueTable[]> {
  return db.selectFrom('transfer_queue').selectAll().where('host_id', '=', hostId).execute();
}

export async function deleteTransfersByHost(db: Kysely<Database>, hostId: string): Promise<void> {
  await db.deleteFrom('transfer_queue').where('host_id', '=', hostId).execute();
}

export async function getQueue(
  db: Kysely<Database>,
  hostLabels: Map<string, string>
): Promise<TransferItem[]> {
  const items = await db
    .selectFrom('transfer_queue')
    .selectAll()
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'asc')
    .execute();

  return items.map((item) => ({
    ...item,
    hostLabel: hostLabels.get(item.host_id),
  }));
}

export async function getHistory(
  db: Kysely<Database>,
  limit = 100
): Promise<TransferHistoryTable[]> {
  return db
    .selectFrom('transfer_history')
    .selectAll()
    .orderBy('completed_at', 'desc')
    .limit(limit)
    .execute();
}

export async function clearHistory(db: Kysely<Database>, before?: number): Promise<void> {
  let query = db.deleteFrom('transfer_history');

  if (before) {
    query = query.where('completed_at', '<', before);
  }

  await query.execute();
}

export async function getNextPendingTransfer(
  db: Kysely<Database>,
  active?: Iterable<{ transfer: TransferQueueTable }>
): Promise<TransferQueueTable | undefined> {
  let query = db.selectFrom('transfer_queue').selectAll().where('status', '=', 'pending');
  // Keep unrelated files parallel, but don't start another writer while a
  // cancelled/paused attempt still owns the same destination.
  if (active) {
    for (const { transfer } of active) {
      query = transfer.type === 'download'
        ? query.where(eb => eb.or([
            eb('type', '!=', 'download'),
            eb('local_path', '!=', transfer.local_path),
          ]))
        : query.where(eb => eb.or([
            eb('type', '!=', 'upload'),
            eb('host_id', '!=', transfer.host_id),
            eb('remote_path', '!=', transfer.remote_path),
          ]));
    }
  }
  return query
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'asc')
    .limit(1)
    .executeTakeFirst();
}

export async function markTransferActive(
  db: Kysely<Database>,
  transferId: string
): Promise<void> {
  await db
    .updateTable('transfer_queue')
    .set({
      status: 'active',
      started_at: Date.now(),
    })
    .where('id', '=', transferId)
    .execute();
}

export async function updateTransferred(
  db: Kysely<Database>,
  transferId: string,
  transferred: number,
  total: number
): Promise<void> {
  await db
    .updateTable('transfer_queue')
    .set({ transferred, file_size: total })
    .where('id', '=', transferId)
    .execute();
}

export async function moveToHistory(
  db: Kysely<Database>,
  transfer: TransferQueueTable,
  hostLabel: string,
  status: 'completed' | 'failed' | 'cancelled',
  error?: string
): Promise<void> {
  const historyItem = {
    id: transfer.id,
    host_id: transfer.host_id,
    host_label: hostLabel,
    type: transfer.type as TransferType,
    status,
    local_path: transfer.local_path,
    remote_path: transfer.remote_path,
    file_name: transfer.file_name,
    file_size: transfer.file_size ?? null,
    transferred: transfer.transferred ?? 0,
    error: error ?? transfer.error ?? null,
    started_at: transfer.started_at ?? null,
    completed_at: Date.now(),
  };

  await db.insertInto('transfer_history').values(historyItem).execute();
}

export async function resetActiveTransfersToPending(db: Kysely<Database>): Promise<void> {
  await db
    .updateTable('transfer_queue')
    .set({ status: 'pending', started_at: null })
    .where('status', '=', 'active')
    .execute();
}

export async function countPendingTransfers(db: Kysely<Database>): Promise<number> {
  const pendingCount = await db
    .selectFrom('transfer_queue')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .where('status', '=', 'pending')
    .executeTakeFirst();

  return pendingCount ? Number(pendingCount.count) : 0;
}

function createQueueRecord(
  item: QueueTransferInput,
  priority: number,
  createdAt: number = Date.now()
): TransferQueueTable {
  const id = uuidv4();
  const fileName = path.basename(item.localPath || item.remotePath);

  return {
    id,
    host_id: item.hostId,
    type: item.type,
    status: 'pending' as TransferStatus,
    local_path: item.localPath,
    remote_path: item.remotePath,
    file_name: fileName,
    file_size: item.fileSize ?? null,
    transferred: 0,
    error: null,
    priority,
    created_at: createdAt,
    started_at: null,
    completed_at: null,
  };
}
