import type { KeyValueItem } from '../KeyValueEditor';
import type { BodyValue } from './types';

export function hasBodyContent(body: BodyValue): boolean {
  if (typeof body === 'string') return /\S/.test(body);
  const iterator = body.iter();
  while (!iterator.next().done) {
    if (/\S/.test(iterator.value)) return true;
  }
  return false;
}

export function parseFormUrlEncoded(body: string): KeyValueItem[] {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        id: item.id || `url-${index}`,
        key: item.key || '',
        value: item.value || '',
        enabled: item.enabled !== false,
      }));
    }
  } catch {
    if (body.includes('=')) {
      const params = new URLSearchParams(body);
      const items: KeyValueItem[] = [];
      let idx = 0;
      params.forEach((value, key) => {
        items.push({
          id: `url-${idx++}`,
          key,
          value,
          enabled: true,
        });
      });
      return items;
    }
  }
  return [];
}

export function serializeFormUrlEncoded(items: KeyValueItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      key: item.key,
      value: item.value,
      enabled: item.enabled,
    }))
  );
}
