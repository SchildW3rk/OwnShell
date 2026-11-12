/** Hard cap for API client response bodies; the whole body is held in memory and sent over IPC. */
export const MAX_RESPONSE_BODY_BYTES = 50 * 1024 * 1024;

export function responseTooLargeError(): Error {
  return new Error(`Response body exceeds the ${MAX_RESPONSE_BODY_BYTES / 1024 / 1024} MB limit`);
}

/** Reads a fetch body as raw bytes, aborting once it exceeds the cap. */
export async function readResponseBytes(
  response: Response,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw responseTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Reads a fetch body as UTF-8, aborting once it exceeds the cap. */
export async function readResponseText(
  response: Response,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): Promise<{ text: string; size: number }> {
  const bytes = await readResponseBytes(response, maxBytes);
  return { text: bytes.toString('utf8'), size: bytes.length };
}

const TEXT_CONTENT_TYPE = /^text\/|[+/](json|xml|javascript|ecmascript|yaml|csv|x-www-form-urlencoded|graphql)\b|^application\/(json|xml|javascript|x-ndjson)\b/i;

/**
 * Text bodies are decoded once (never per chunk); binary bodies stay bytes so
 * images, PDFs and archives are not corrupted by UTF-8 decoding.
 */
export function decodeResponseBody(
  bytes: Buffer,
  contentType: string | undefined
): { body: string; bodyBytes?: Uint8Array } {
  if (bytes.length === 0) return { body: '' };
  const type = (contentType ?? '').split(';')[0].trim();
  if (type) {
    return TEXT_CONTENT_TYPE.test(type)
      ? { body: bytes.toString('utf8') }
      : { body: '', bodyBytes: new Uint8Array(bytes) };
  }
  try {
    return { body: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { body: '', bodyBytes: new Uint8Array(bytes) };
  }
}
