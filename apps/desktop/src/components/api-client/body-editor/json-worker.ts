interface JsonJob {
  id: number;
  value: string;
  format: boolean;
}

self.onmessage = ({ data }: MessageEvent<JsonJob>) => {
  const started = performance.now();
  try {
    const parsed = data.value.trim() ? JSON.parse(data.value) : undefined;
    const parsedAt = performance.now();
    const formatted = data.format ? (parsed === undefined ? '' : JSON.stringify(parsed, null, 2)) : undefined;
    self.postMessage({
      id: data.id,
      error: null,
      formatted,
      parseMs: parsedAt - started,
      formatMs: performance.now() - parsedAt,
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
      parseMs: performance.now() - started,
      formatMs: 0,
    });
  }
};

export {};
