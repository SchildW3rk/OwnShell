import { Transform, TransformCallback } from 'stream';
import { logger } from '../../logger';

/**
 * Filters problematic statements from external PostgreSQL dumps before import.
 */
export class SQLFilterTransform extends Transform {
  private buffer = '';
  private lineCount = 0;
  private filteredCount = 0;

  private readonly filterPatterns = [
    /^\\restrict\b/i,
    /^\\unrestrict\b/i,
    /^\\connect\b/i,
    /^DROP DATABASE\b/i,
    /^CREATE DATABASE\b/i,
    /^ALTER DATABASE\b.*\bOWNER TO\b/i,
    /^ALTER TABLE\b.*\bOWNER TO\b/i,
    /^ALTER SEQUENCE\b.*\bOWNER TO\b/i,
    /^ALTER FUNCTION\b.*\bOWNER TO\b/i,
    /^ALTER TYPE\b.*\bOWNER TO\b/i,
  ];

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString();

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const outputLines: string[] = [];

    for (const line of lines) {
      this.lineCount++;
      const trimmedLine = line.trim();
      const shouldFilter = this.filterPatterns.some((pattern) => pattern.test(trimmedLine));

      if (shouldFilter) {
        this.filteredCount++;
        if (this.filteredCount <= 5) {
          logger.debug('SQL filter: removed line', {
            lineNum: this.lineCount,
            line: trimmedLine.slice(0, 80),
          });
        }
      } else {
        outputLines.push(line);
      }
    }

    if (outputLines.length > 0) {
      this.push(outputLines.join('\n') + '\n');
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.buffer.length > 0) {
      const trimmedLine = this.buffer.trim();
      const shouldFilter = this.filterPatterns.some((pattern) => pattern.test(trimmedLine));

      if (!shouldFilter) {
        this.push(this.buffer);
      } else {
        this.filteredCount++;
      }
    }

    logger.info('SQL filter completed', {
      totalLines: this.lineCount,
      filteredLines: this.filteredCount,
    });

    callback();
  }
}

