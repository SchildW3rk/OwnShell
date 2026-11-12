/**
 * "Copy as curl": renders the output of the shared request preparation as a
 * POSIX shell command, so the copied command sends what OwnShell would send.
 */

import { shellQuote } from '../utils/shell-quote';
import { MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from './http-client';
import type { ExportedRequest } from './prepare-request';

export interface CurlExportOptions {
  timeoutSeconds?: number;
  followRedirects?: boolean;
  verifyTls?: boolean;
}

export function toCurlCommand(request: ExportedRequest, options: CurlExportOptions = {}): string {
  // One option per line keeps long commands readable in a terminal.
  const lines = ['curl'];
  if (request.method === 'HEAD') lines.push('--head');
  else if (request.method !== 'GET' || request.body?.length || request.parts?.length) {
    lines.push(`-X ${request.method}`);
  }
  lines.push(shellQuote(request.url));

  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    // curl builds its own multipart boundary.
    if (request.parts && lower === 'content-type') continue;
    const basic = lower === 'authorization' && /^Basic\s+(\S+)$/i.exec(value);
    const decoded = basic ? Buffer.from(basic[1], 'base64').toString('utf8') : '';
    lines.push(decoded.includes(':') ? `-u ${shellQuote(decoded)}` : `-H ${shellQuote(`${name}: ${value}`)}`);
  }

  if (request.parts) {
    for (const part of request.parts) {
      lines.push(
        'filePath' in part
          ? `-F ${shellQuote(`${part.name}=@${part.filePath}`)}`
          : // --form-string sends the value literally (no @file, <file or ;type= parsing).
            `--form-string ${shellQuote(`${part.name}=${part.value}`)}`
      );
    }
  } else if (request.bodyFile) {
    lines.push(`--data-binary ${shellQuote(`@${request.bodyFile}`)}`);
  } else if (request.body?.length) {
    lines.push(`--data-raw ${shellQuote(request.body.toString('utf8'))}`);
  }

  if (options.verifyTls === false) lines.push('-k');
  // Same limits as a send: curl's defaults are no deadline and 50 redirects.
  if (options.followRedirects !== false) lines.push('-L', `--max-redirs ${MAX_REDIRECTS}`);
  lines.push(`--max-time ${options.timeoutSeconds ?? REQUEST_TIMEOUT_MS / 1000}`);
  return lines.join(' \\\n  ');
}
