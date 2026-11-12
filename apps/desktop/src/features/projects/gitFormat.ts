import type { Language } from '@codemirror/language';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';

export function formatAbsoluteDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function formatRelativeDate(value: string, locale: string, now = Date.now()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

// Theme-aware token colors from the app's semantic palette (used outside a CodeMirror editor).
const tokenHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], class: 'text-primary' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], class: 'text-success' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta], class: 'italic text-muted-foreground' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'text-warning' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'text-info' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], class: 'text-info' },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName], class: 'text-destructive/80' },
  { tag: [tags.heading, tags.strong], class: 'font-semibold' },
  { tag: tags.emphasis, class: 'italic' },
  { tag: [tags.tagName, tags.link, tags.url], class: 'text-primary' },
]);

export interface TokenSpan {
  from: number;
  to: number;
  className: string;
}

export interface LineSegment {
  from: number;
  to: number;
  syntaxClass?: string;
  changed: boolean;
}

/** Longer lines (minified bundles) are shown as plain text; decorating them would block the UI. */
export const MAX_DECORATED_LINE_CHARS = 2000;

/**
 * Splits a line at syntax-span and changed-range boundaries in one linear pass.
 * Spans and ranges are non-overlapping; they are sorted here.
 */
export function lineSegments(
  text: string,
  spans: TokenSpan[] = [],
  changed: Array<[number, number]> = []
): LineSegment[] {
  if (text.length > MAX_DECORATED_LINE_CHARS || (!spans.length && !changed.length)) {
    return [{ from: 0, to: text.length, changed: false }];
  }
  const boundaries = new Set<number>([0, text.length]);
  for (const span of spans) boundaries.add(span.from).add(span.to);
  for (const [from, to] of changed) boundaries.add(from).add(to);
  const points = [...boundaries].filter((point) => point >= 0 && point <= text.length).sort((a, b) => a - b);
  const sortedSpans = [...spans].sort((a, b) => a.from - b.from);
  const sortedRanges = [...changed].sort((a, b) => a[0] - b[0]);
  const segments: LineSegment[] = [];
  let spanIndex = 0;
  let rangeIndex = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    while (spanIndex < sortedSpans.length && sortedSpans[spanIndex].to <= from) spanIndex += 1;
    while (rangeIndex < sortedRanges.length && sortedRanges[rangeIndex][1] <= from) rangeIndex += 1;
    const span = sortedSpans[spanIndex];
    const range = sortedRanges[rangeIndex];
    segments.push({
      from,
      to,
      syntaxClass: span && span.from <= from && span.to >= to ? span.className : undefined,
      changed: !!range && range[0] <= from && range[1] >= to,
    });
  }
  return segments;
}

/** Highlights consecutive lines as one block (keeps multi-line context) and splits spans per line. */
export function highlightLines(language: Language, lines: string[]): TokenSpan[][] {
  const result: TokenSpan[][] = lines.map(() => []);
  const text = lines.join('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  let lineIndex = 0;
  highlightTree(language.parser.parse(text), tokenHighlighter, (from, to, className) => {
    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= from) lineIndex += 1;
    // Spans can cross line breaks (block comments); clip them per line.
    for (let index = lineIndex; index < lines.length && lineStarts[index] < to; index += 1) {
      const start = Math.max(from, lineStarts[index]) - lineStarts[index];
      const end = Math.min(to, lineStarts[index] + lines[index].length) - lineStarts[index];
      if (end > start) result[index].push({ from: start, to: end, className });
    }
  });
  return result;
}
