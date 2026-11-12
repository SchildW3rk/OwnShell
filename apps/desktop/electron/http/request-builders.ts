import type { RequestAuthType, RequestBodyType } from '@ownshell/core';
import type { AuthConfig, KeyValueItem } from './types';

export function parseKeyValueItems(json: string): KeyValueItem[] {
  try {
    const items = JSON.parse(json);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function parseAuthConfig(json: string): AuthConfig {
  try {
    return JSON.parse(json) as AuthConfig;
  } catch {
    return {};
  }
}

export function interpolateVariables(text: string, variables?: Record<string, string>): string {
  if (!variables || !text.includes('{{')) {
    return text;
  }

  return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmedName = varName.trim();
    return variables[trimmedName] ?? match;
  });
}

export function appendQueryParams(
  url: string,
  params: KeyValueItem[],
  variables?: Record<string, string>
): string {
  const enabledParams = params.filter((param) => param.enabled && param.key.trim());
  if (enabledParams.length === 0) return url;

  try {
    const urlObj = new URL(url);
    for (const param of enabledParams) {
      const key = interpolateVariables(param.key, variables);
      const value = interpolateVariables(param.value, variables);
      urlObj.searchParams.append(key, value);
    }
    return urlObj.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const queryString = enabledParams
      .map((param) => {
        const key = encodeURIComponent(interpolateVariables(param.key, variables));
        const value = encodeURIComponent(interpolateVariables(param.value, variables));
        return `${key}=${value}`;
      })
      .join('&');
    return `${url}${separator}${queryString}`;
  }
}

export function addAuthHeader(
  headers: Record<string, string>,
  authType: RequestAuthType,
  config: AuthConfig,
  variables?: Record<string, string>
): void {
  switch (authType) {
    case 'bearer':
      if (config.token) {
        const token = interpolateVariables(config.token, variables);
        headers['Authorization'] = `Bearer ${token}`;
      }
      break;

    case 'basic':
      if (config.username || config.password) {
        const username = interpolateVariables(config.username || '', variables);
        const password = interpolateVariables(config.password || '', variables);
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      break;

    case 'api-key':
      if (config.key && config.value && config.addTo !== 'query') {
        const key = config.key;
        const value = interpolateVariables(config.value, variables);
        headers[key] = value;
      }
      break;
  }
}

export function addContentTypeHeader(
  headers: Record<string, string>,
  bodyType: RequestBodyType
): void {
  if (headers['Content-Type'] || headers['content-type']) {
    return;
  }

  switch (bodyType) {
    case 'json':
      headers['Content-Type'] = 'application/json';
      break;
    case 'form-urlencoded':
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      break;
    case 'raw':
      headers['Content-Type'] = 'text/plain';
      break;
    case 'form-data':
      break;
  }
}

export function buildRequestBody(
  body: string,
  bodyType: RequestBodyType,
  variables?: Record<string, string>
): string | undefined {
  if (bodyType === 'none' || !body.trim()) {
    return undefined;
  }

  const interpolatedBody = interpolateVariables(body, variables);

  switch (bodyType) {
    case 'json':
      return interpolatedBody;

    case 'form-urlencoded': {
      try {
        const items = JSON.parse(body) as KeyValueItem[];
        return items
          .filter((item) => item.enabled && item.key.trim())
          .map((item) => {
            const key = encodeURIComponent(interpolateVariables(item.key, variables));
            const value = encodeURIComponent(interpolateVariables(item.value, variables));
            return `${key}=${value}`;
          })
          .join('&');
      } catch {
        return interpolatedBody;
      }
    }

    case 'form-data': {
      try {
        const items = JSON.parse(body) as KeyValueItem[];
        const parts: string[] = [];
        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

        for (const item of items) {
          if (!item.enabled || !item.key.trim()) continue;
          const key = interpolateVariables(item.key, variables);
          const value = interpolateVariables(item.value, variables);
          parts.push(`--${boundary}`);
          parts.push(`Content-Disposition: form-data; name="${key}"`);
          parts.push('');
          parts.push(value);
        }
        parts.push(`--${boundary}--`);
        return parts.join('\r\n');
      } catch {
        return interpolatedBody;
      }
    }

    case 'raw':
    case 'binary':
    default:
      return interpolatedBody;
  }
}

export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const sensitiveParams = ['api_key', 'apikey', 'token', 'secret', 'password', 'auth'];

    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '***');
      }
    }

    return urlObj.toString();
  } catch {
    return url;
  }
}
