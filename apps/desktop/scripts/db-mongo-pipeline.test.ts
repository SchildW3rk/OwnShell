import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAggregationPipeline, withResultLimit } from '../electron/db-explorer/mongo-pipeline';
import { mongoPipelineWrites } from '../electron/db-explorer/read-only-guard';

test('pipeline parser accepts arrays and single stages, rejects malformed ones', () => {
  assert.deepEqual(parseAggregationPipeline('[{"$match": {"a": 1}}, {"$limit": 5}]'), {
    ok: true,
    pipeline: [{ $match: { a: 1 } }, { $limit: 5 }],
  });
  assert.deepEqual(parseAggregationPipeline('{"$count": "n"}'), { ok: true, pipeline: [{ $count: 'n' }] });
  assert.deepEqual(parseAggregationPipeline('[{"$match": {}'), { ok: false, error: 'json' });
  assert.deepEqual(parseAggregationPipeline('[]'), { ok: false, error: 'empty' });
  assert.deepEqual(parseAggregationPipeline('[{"$match": {}}, {"match": {}}]'), { ok: false, error: 'stage', stage: 2 });
  assert.deepEqual(parseAggregationPipeline('[{"$match": {}, "$out": "x"}]'), { ok: false, error: 'stage', stage: 1 });
  assert.deepEqual(parseAggregationPipeline('[1]'), { ok: false, error: 'stage', stage: 1 });
  assert.equal(parseAggregationPipeline(JSON.stringify(Array(101).fill({ $limit: 1 }))).ok, false);
});

test('result cap is appended unless the pipeline writes', () => {
  assert.deepEqual(withResultLimit([{ $match: {} }], 3), [{ $match: {} }, { $limit: 3 }]);
  assert.deepEqual(withResultLimit([{ $match: {} }, { $out: 'x' }], 3), [{ $match: {} }, { $out: 'x' }]);
  assert.deepEqual(withResultLimit([{ $merge: { into: 'x' } }], 3), [{ $merge: { into: 'x' } }]);
});

test('read-only guard spots $out/$merge in any key of any stage', () => {
  assert.equal(mongoPipelineWrites([{ $match: {} }, { $group: { _id: '$a' } }]), false);
  assert.equal(mongoPipelineWrites([{ $match: {} }, { $out: 'copy' }]), true);
  // Writes hidden in sub-pipelines are caught too.
  assert.equal(mongoPipelineWrites([{ $facet: { x: [{ $out: 'copy' }] } }]), true);
  assert.equal(mongoPipelineWrites([{ $lookup: { from: 'a', as: 'b', pipeline: [{ $merge: { into: 'c' } }] } }]), true);
  assert.equal(mongoPipelineWrites([{ $unionWith: { coll: 'a', pipeline: [{ $facet: { y: [{ $out: 'd' }] } }] } }]), true);
  assert.equal(mongoPipelineWrites([{ $lookup: { from: 'a', as: 'b', pipeline: [{ $match: {} }] } }, { $facet: { x: [{ $count: 'n' }] } }]), false);
  assert.equal(mongoPipelineWrites([{ $merge: { into: 'copy' } }]), true);
  // A malformed stage from a tampered IPC call still counts.
  assert.equal(mongoPipelineWrites([{ $match: {}, $out: 'copy' }]), true);
});
