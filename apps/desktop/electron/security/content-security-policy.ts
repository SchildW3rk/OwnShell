type CspDirective = readonly [name: string, ...sources: string[]];

function serializeDirectives(directives: CspDirective[]): string {
  return directives.map(([name, ...sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

export function buildContentSecurityPolicy(isDevelopment: boolean): string {
  const commonDirectives: CspDirective[] = [
    ['default-src', "'self'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', 'file:', 'http:', 'https:'],
    ['font-src', "'self'", 'data:'],
    ['media-src', "'self'", 'data:', 'blob:', 'file:', 'http:', 'https:'],
    ['frame-src', "'self'", 'about:'],
    ['worker-src', "'self'", 'blob:'],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['frame-ancestors', "'none'"],
  ];

  if (isDevelopment) {
    return serializeDirectives([
      ['script-src', "'self'", "'unsafe-eval'", "'unsafe-inline'"],
      ['connect-src', "'self'", 'http:', 'https:', 'ws:', 'wss:'],
      ...commonDirectives,
    ]);
  }

  return serializeDirectives([
    ['script-src', "'self'"],
    ['connect-src', "'self'"],
    ...commonDirectives,
  ]);
}
