import { Folder, File } from 'lucide-react';

export interface LocalFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: Date;
}

const TEXT_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'pyw', 'rb', 'php', 'java', 'c', 'cpp',
  'h', 'hpp', 'go', 'rs', 'swift', 'kt', 'scala', 'clj', 'json', 'jsonc', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'xml', 'plist', 'html', 'htm', 'css',
  'scss', 'less', 'sass', 'svg', 'md', 'mdx', 'txt', 'rst', 'tex', 'log', 'sh', 'bash',
  'zsh', 'fish', 'ps1', 'bat', 'cmd', 'csv', 'sql', 'dockerfile', 'makefile', 'gitignore',
  'gitattributes', 'editorconfig', 'prettierrc', 'eslintrc', 'babelrc',
]);

export const isTextFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const baseName = filename.toLowerCase();
  return (
    TEXT_EXTENSIONS.has(ext) ||
    baseName === 'caddyfile' ||
    baseName === 'dockerfile' ||
    baseName === 'makefile' ||
    baseName.startsWith('.')
  );
};

export const joinRemotePath = (currentPath: string, name: string): string => {
  if (currentPath === '/' || currentPath === '') {
    return `/${name}`;
  }
  return currentPath.endsWith('/') ? `${currentPath}${name}` : `${currentPath}/${name}`;
};

export const getLocalFileIcon = (file: LocalFileEntry) => {
  if (file.type === 'directory') return <Folder className="w-4 h-4 text-accent" />;
  return <File className="w-4 h-4 text-info" />;
};
