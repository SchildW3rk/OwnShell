export const DEFAULT_TERMINAL_FONT_FAMILY = [
  '"JetBrainsMono Nerd Font"',
  '"JetBrainsMono Nerd Font Mono"',
  '"MesloLGS NF"',
  '"MesloLGS Nerd Font Mono"',
  '"CaskaydiaMono Nerd Font Mono"',
  '"CaskaydiaMono Nerd Font"',
  '"CaskaydiaMono NF"',
  '"CaskaydiaMono NFM"',
  '"CaskaydiaCove Nerd Font"',
  '"CaskaydiaCove Nerd Font Mono"',
  '"Caskaydia Cove Nerd Font"',
  '"Caskaydia Cove Nerd Font Mono"',
  '"BlexMono Nerd Font Mono"',
  '"BlexMono Nerd Font"',
  '"Hack Nerd Font Mono"',
  '"Hack Nerd Font"',
  '"Symbols Nerd Font Mono"',
  '"Symbols Nerd Font"',
  '"Cascadia Code NF"',
  '"Cascadia Code NF Mono"',
  '"FiraCode Nerd Font"',
  '"FiraCode Nerd Font Mono"',
  '"JetBrains Mono NL"',
  '"Cascadia Code"',
  '"Fira Code"',
  '"SF Mono"',
  'Monaco',
  '"Courier New"',
  'monospace',
].join(', ');

export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 24;

export const DEFAULT_EDITOR_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace';
export const DEFAULT_EDITOR_FONT_SIZE = 13;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 22;

export interface FontPreset {
  id: string;
  label: string;
  value: string;
}

export const TERMINAL_FONT_PRESETS: FontPreset[] = [
  {
    id: 'auto',
    label: 'Auto (Nerd Font Fallback)',
    value: DEFAULT_TERMINAL_FONT_FAMILY,
  },
  {
    id: 'jetbrains-nerd',
    label: 'JetBrainsMono Nerd Font',
    value:
      '"JetBrainsMono Nerd Font", "JetBrainsMono Nerd Font Mono", "Symbols Nerd Font Mono", "Symbols Nerd Font", "JetBrains Mono NL", monospace',
  },
  {
    id: 'meslo',
    label: 'MesloLGS NF',
    value:
      '"MesloLGS NF", "MesloLGS Nerd Font Mono", "Symbols Nerd Font Mono", "Symbols Nerd Font", monospace',
  },
  {
    id: 'caskaydia',
    label: 'CaskaydiaMono Nerd Font',
    value:
      '"CaskaydiaMono Nerd Font Mono", "CaskaydiaMono Nerd Font", "CaskaydiaMono NF", "CaskaydiaMono NFM", "CaskaydiaCove Nerd Font", "CaskaydiaCove Nerd Font Mono", "Caskaydia Cove Nerd Font", "Caskaydia Cove Nerd Font Mono", "Symbols Nerd Font Mono", "Symbols Nerd Font", monospace',
  },
  {
    id: 'blex-mono',
    label: 'BlexMono Nerd Font',
    value:
      '"BlexMono Nerd Font Mono", "BlexMono Nerd Font", "Symbols Nerd Font Mono", "Symbols Nerd Font", monospace',
  },
  {
    id: 'hack-nerd',
    label: 'Hack Nerd Font',
    value:
      '"Hack Nerd Font Mono", "Hack Nerd Font", "Symbols Nerd Font Mono", "Symbols Nerd Font", monospace',
  },
  {
    id: 'sf-mono',
    label: 'SF Mono',
    value: '"SF Mono", Monaco, "Courier New", monospace',
  },
];

export const EDITOR_FONT_PRESETS: FontPreset[] = [
  {
    id: 'system-mono',
    label: 'System Mono',
    value: DEFAULT_EDITOR_FONT_FAMILY,
  },
  {
    id: 'sf-mono',
    label: 'SF Mono',
    value: '"SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    value: '"JetBrains Mono", "JetBrainsMono Nerd Font", Menlo, monospace',
  },
  {
    id: 'menlo',
    label: 'Menlo',
    value: 'Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'monaco',
    label: 'Monaco',
    value: 'Monaco, Menlo, Consolas, monospace',
  },
];

export function clampTerminalFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(value)));
}

export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(value)));
}

export function normalizeTerminalFontFamily(value: string | undefined | null): string {
  if (!value) return DEFAULT_TERMINAL_FONT_FAMILY;

  if (value.includes('CaskaydiaCove') || value.includes('Caskaydia Cove')) {
    return TERMINAL_FONT_PRESETS.find((preset) => preset.id === 'caskaydia')?.value ?? value;
  }

  if (value.includes('JetBrains Mono NL') && !value.includes('Symbols Nerd Font')) {
    return DEFAULT_TERMINAL_FONT_FAMILY;
  }

  return value;
}
