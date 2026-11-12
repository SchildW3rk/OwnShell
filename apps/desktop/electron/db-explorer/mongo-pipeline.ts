// Pure helpers shared by the renderer (parsing) and the main process (result cap).

export type MongoPipelineStage = Record<string, unknown>;

export type PipelineParseResult =
  | { ok: true; pipeline: MongoPipelineStage[] }
  | { ok: false; error: 'json' | 'empty' | 'tooLong' | 'stage'; stage?: number };

export const MAX_PIPELINE_STAGES = 100;
export const MAX_AGGREGATION_RESULTS = 500;

/** Parses the pipeline editor: a JSON array of stages (a single stage object is accepted too). */
export function parseAggregationPipeline(text: string): PipelineParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  const stages = Array.isArray(value) ? value : [value];
  if (stages.length === 0) return { ok: false, error: 'empty' };
  if (stages.length > MAX_PIPELINE_STAGES) return { ok: false, error: 'tooLong' };
  for (const [index, stage] of stages.entries()) {
    const keys = stage && typeof stage === 'object' && !Array.isArray(stage) ? Object.keys(stage) : [];
    // MongoDB requires exactly one `$operator` field per stage.
    if (keys.length !== 1 || !keys[0].startsWith('$')) {
      return { ok: false, error: 'stage', stage: index + 1 };
    }
  }
  return { ok: true, pipeline: stages as MongoPipelineStage[] };
}

/** Caps what an aggregation sends back; $out/$merge must stay last, they return nothing. */
export function withResultLimit(pipeline: MongoPipelineStage[], limit: number): MongoPipelineStage[] {
  const last = pipeline[pipeline.length - 1];
  if (last && ('$out' in last || '$merge' in last)) return pipeline;
  return [...pipeline, { $limit: limit }];
}
