import type { HttpResponse as NetworkResponse } from '../../../../electron/http/types';

export type HttpResponse = NetworkResponse & { ipcRoundTripMs?: number };

export type ResponseTab = 'body' | 'headers' | 'preview';
export type ResponseContentType = 'json' | 'xml' | 'html' | 'text';
