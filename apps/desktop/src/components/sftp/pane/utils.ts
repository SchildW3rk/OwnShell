const TEXT_EXTENSIONS = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'pyw',
  'rb',
  'php',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'go',
  'rs',
  'swift',
  'kt',
  'scala',
  'clj',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'properties',
  'xml',
  'plist',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'sass',
  'svg',
  'md',
  'mdx',
  'txt',
  'rst',
  'tex',
  'log',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'csv',
  'sql',
  'dockerfile',
  'makefile',
  'gitignore',
  'gitattributes',
  'editorconfig',
  'prettierrc',
  'eslintrc',
  'babelrc',
];

export function isTextFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const baseName = filename.toLowerCase();
  return (
    TEXT_EXTENSIONS.includes(ext) ||
    baseName === 'caddyfile' ||
    baseName === 'dockerfile' ||
    baseName === 'makefile' ||
    baseName.startsWith('.')
  );
}

export function joinRemotePath(currentPath: string, name: string): string {
  if (currentPath === '/' || currentPath === '') {
    return `/${name}`;
  }
  return currentPath.endsWith('/') ? `${currentPath}${name}` : `${currentPath}/${name}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
