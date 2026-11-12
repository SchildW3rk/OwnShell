import type { HttpMethod } from '@ownshell/core';

export const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-blue-500 text-white',
  POST: 'bg-amber-500 text-black',
  PUT: 'bg-orange-500 text-white',
  PATCH: 'bg-purple-500 text-white',
  DELETE: 'bg-red-500 text-white',
  HEAD: 'bg-muted text-white',
  OPTIONS: 'bg-muted text-white',
};

export const methodShort: Record<HttpMethod, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT',
};
