export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 429 || error.status >= 500;
  }
  // A malformed body will not improve on a second attempt.
  return !(error instanceof SyntaxError);
}

/**
 * Decodes JSON that may be gzipped. A host may or may not decompress .gz files
 * itself, so this checks the bytes rather than trusting the file name or headers.
 */
async function decodeJson(buffer: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const compressed = new Response(buffer).body as ReadableStream;
  const stream = compressed.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

async function attempt(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new HttpError(response.status);
    }
    return await decodeJson(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches JSON with a per-attempt timeout, retrying with exponential backoff. */
export async function fetchJson(
  url: string,
  { timeoutMs = 8000, retries = 2, backoffMs = 500 }: FetchJsonOptions = {},
): Promise<unknown> {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt(url, timeoutMs);
    } catch (error) {
      if (tries >= retries || !isRetryable(error)) {
        console.error(`Request failed: ${url}`, error);
        throw error;
      }
      const delayMs = backoffMs * 2 ** tries;
      console.warn(`Retrying ${url} in ${delayMs} ms`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
