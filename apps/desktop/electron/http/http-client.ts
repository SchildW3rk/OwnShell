/**
 * HTTP Client Service (v1.18.0)
 *
 * Executes HTTP requests directly or through SSH tunnels. Request parsing,
 * body/header construction, timeout handling, and tunnel transport live in
 * focused helper modules.
 */

import { logger } from '../logger';
import { fetchWithTimeout, readResponseText } from './fetch-timeout';
import {
  addAuthHeader,
  addContentTypeHeader,
  appendQueryParams,
  buildRequestBody,
  interpolateVariables,
  parseAuthConfig,
  parseKeyValueItems,
  sanitizeUrl,
} from './request-builders';
import { requestViaTunnel } from './tunnel-request';
import type { HttpEnvironment, HttpRequestConfig, HttpResponse } from './types';

export type {
  AuthConfig,
  EnvironmentVariable,
  HttpEnvironment,
  HttpRequestConfig,
  HttpResponse,
  KeyValueItem,
} from './types';

export class HttpClient {
  /**
   * Execute an HTTP request.
   */
  async execute(
    config: HttpRequestConfig,
    _environment?: HttpEnvironment,
    decryptedVariables?: Record<string, string>
  ): Promise<HttpResponse> {
    const startTime = Date.now();
    const started = performance.now();

    try {
      const params = parseKeyValueItems(config.params);
      const headers = parseKeyValueItems(config.headers);
      const authConfig = parseAuthConfig(config.authConfig);

      let url = interpolateVariables(config.url, decryptedVariables);
      url = appendQueryParams(url, params, decryptedVariables);

      if (config.authType === 'api-key' && authConfig.addTo === 'query' && authConfig.key) {
        const keyValue = interpolateVariables(authConfig.value || '', decryptedVariables);
        const urlObj = new URL(url);
        urlObj.searchParams.set(authConfig.key, keyValue);
        url = urlObj.toString();
      }

      const requestHeaders = this.buildHeaders(config, headers, authConfig, decryptedVariables);
      const requestBody = buildRequestBody(config.body, config.bodyType, decryptedVariables);

      logger.info('Executing HTTP request', {
        method: config.method,
        url: sanitizeUrl(url),
        bodyType: config.bodyType,
        authType: config.authType,
      });

      const networkStarted = performance.now();
      const response = await fetchWithTimeout(url, {
        method: config.method,
        headers: requestHeaders,
        body: config.method !== 'GET' && config.method !== 'HEAD' ? requestBody : undefined,
      });

      const headersReceived = performance.now();
      const { text: responseBody, size: responseSize } = await readResponseText(response);
      const bodyReceived = performance.now();
      const result: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: this.extractFetchHeaders(response),
        body: responseBody,
        time: Date.now() - startTime,
        size: responseSize,
        timings: {
          prepareMs: networkStarted - started,
          headersMs: headersReceived - networkStarted,
          bodyReadMs: bodyReceived - headersReceived,
          totalMs: bodyReceived - started,
        },
      };

      logger.info('HTTP request completed', {
        status: result.status,
        time: result.time,
        size: result.size,
      });

      return result;
    } catch (error) {
      return this.errorResponse(config.url, error, Date.now() - startTime, false);
    }
  }

  /**
   * Execute request via SSH tunnel.
   */
  async executeViaTunnel(
    config: HttpRequestConfig,
    tunnelPort: number,
    _environment?: HttpEnvironment,
    decryptedVariables?: Record<string, string>
  ): Promise<HttpResponse> {
    const startTime = Date.now();

    try {
      const params = parseKeyValueItems(config.params);
      const headers = parseKeyValueItems(config.headers);
      const authConfig = parseAuthConfig(config.authConfig);

      let url = interpolateVariables(config.url, decryptedVariables);
      url = appendQueryParams(url, params, decryptedVariables);

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';

      if (config.authType === 'api-key' && authConfig.addTo === 'query' && authConfig.key) {
        const keyValue = interpolateVariables(authConfig.value || '', decryptedVariables);
        urlObj.searchParams.set(authConfig.key, keyValue);
      }

      const requestHeaders = this.buildHeaders(config, headers, authConfig, decryptedVariables, {
        Host: urlObj.host,
      });
      const requestBody = buildRequestBody(config.body, config.bodyType, decryptedVariables);

      logger.info('Executing HTTP request via tunnel', {
        method: config.method,
        url: sanitizeUrl(url),
        tunnelPort,
        bodyType: config.bodyType,
      });

      const response = await requestViaTunnel(
        tunnelPort,
        isHttps,
        urlObj.pathname + urlObj.search,
        config.method,
        requestHeaders,
        requestBody
      );

      const result: HttpResponse = {
        ...response,
        time: Date.now() - startTime,
      };

      logger.info('HTTP tunnel request completed', {
        status: result.status,
        time: result.time,
        size: result.size,
      });

      return result;
    } catch (error) {
      return this.errorResponse(config.url, error, Date.now() - startTime, true);
    }
  }

  private buildHeaders(
    config: HttpRequestConfig,
    headers: Array<{ key: string; value: string; enabled: boolean }>,
    authConfig: ReturnType<typeof parseAuthConfig>,
    decryptedVariables?: Record<string, string>,
    initialHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const requestHeaders: Record<string, string> = { ...initialHeaders };

    for (const header of headers) {
      if (header.enabled && header.key.trim()) {
        const key = interpolateVariables(header.key, decryptedVariables);
        const value = interpolateVariables(header.value, decryptedVariables);
        requestHeaders[key] = value;
      }
    }

    addAuthHeader(requestHeaders, config.authType, authConfig, decryptedVariables);
    addContentTypeHeader(requestHeaders, config.bodyType);

    return requestHeaders;
  }

  private extractFetchHeaders(response: Response): Record<string, string> {
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return responseHeaders;
  }

  private errorResponse(
    url: string,
    error: unknown,
    time: number,
    isTunnel: boolean
  ): HttpResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(isTunnel ? 'HTTP tunnel request failed' : 'HTTP request failed', {
      url: sanitizeUrl(url),
      error: errorMessage,
    });

    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: JSON.stringify({ error: errorMessage }),
      time,
      size: 0,
    };
  }
}

// Singleton instance
export const httpClient = new HttpClient();
