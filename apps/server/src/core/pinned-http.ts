import http from 'node:http';
import https from 'node:https';
import net, { type LookupFunction } from 'node:net';

export class PinnedHttpError extends Error {
  readonly code: 'PAYLOAD_TOO_LARGE' | 'TIMEOUT' | 'REQUEST_FAILED';

  constructor(code: 'PAYLOAD_TOO_LARGE' | 'TIMEOUT' | 'REQUEST_FAILED', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PinnedHttpError';
    this.code = code;
  }
}

export type PinnedTarget = { address: string; family: 4 | 6 };
export type PinnedResponse = { status: number; headers: Headers; text: string };

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === 'string') {
      headers.append(key, value);
    }
  }
  return headers;
}

/**
 * Fetches `url` over HTTP or HTTPS while pinning DNS resolution to the pre-validated IP in `target`.
 * Never follows redirects, enforces streaming `maxBytes`, and avoids TOCTOU DNS rebinding.
 */
export function pinnedRequest(
  url: URL,
  target: PinnedTarget,
  options: { headers?: Record<string, string>; signal?: AbortSignal; maxBytes?: number } = {},
): Promise<PinnedResponse> {
  if (options.signal?.aborted) {
    return Promise.reject(new PinnedHttpError('TIMEOUT', 'Request timed out', { cause: options.signal.reason }));
  }

  const rawHost = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (typeof lookupOptions === 'object' && lookupOptions !== null && lookupOptions.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };

  return new Promise<PinnedResponse>((resolve, reject) => {
    let settled = false;
    const finish = (value: PinnedResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: PinnedHttpError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const requestOptions: https.RequestOptions = {
      method: 'GET',
      agent: false,
      lookup,
      headers: options.headers,
      signal: options.signal,
      ...(url.protocol === 'https:' && net.isIP(rawHost) === 0 ? { servername: rawHost } : {}),
    };

    const request = url.protocol === 'https:' ? https.request(url, requestOptions) : http.request(url, requestOptions);

    request.on('response', (response) => {
      const status = response.statusCode ?? 0;
      const headers = toHeaders(response.headers);
      if (status >= 300 && status < 400) {
        response.destroy();
        finish({ status, headers, text: '' });
        return;
      }

      const contentLength = headers.get('content-length');
      if (options.maxBytes !== undefined && contentLength && Number(contentLength) > options.maxBytes) {
        fail(new PinnedHttpError('PAYLOAD_TOO_LARGE', 'Response body exceeds size cap'));
        response.destroy();
        request.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        totalBytes += chunk.byteLength;
        if (options.maxBytes !== undefined && totalBytes > options.maxBytes) {
          fail(new PinnedHttpError('PAYLOAD_TOO_LARGE', 'Response body exceeds size cap'));
          response.destroy();
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        finish({ status, headers, text: Buffer.concat(chunks, totalBytes).toString('utf8') });
      });
      response.on('aborted', () => {
        fail(new PinnedHttpError(options.signal?.aborted ? 'TIMEOUT' : 'REQUEST_FAILED', 'Response aborted'));
      });
      response.on('error', (error) => {
        fail(new PinnedHttpError('REQUEST_FAILED', error.message, { cause: error }));
      });
    });

    request.on('error', (error) => {
      const isTimeout = options.signal?.aborted || error.name === 'AbortError' || error.name === 'TimeoutError';
      fail(new PinnedHttpError(isTimeout ? 'TIMEOUT' : 'REQUEST_FAILED', error.message, { cause: error }));
    });

    request.end();
  });
}
