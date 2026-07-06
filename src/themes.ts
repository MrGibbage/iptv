// Built-in color themes. A theme is just the 16 design tokens from index.css —
// every surface styles itself off these variables, so swapping them repaints
// the whole app with no component changes. Applied by setting the variables
// inline on :root (which overrides the stylesheet, including its
// prefers-color-scheme light block); the "system" pseudo-theme clears them so
// the stylesheet's OS-driven light/dark takes over again.

export type ThemeTokens = Record<(typeof THEME_TOKENS)[number], string>

export const THEME_TOKENS = [
  'bg-0',
  'bg-1',
  'bg-2',
  'bg-3',
  'border',
  'border-strong',
  'text',
  'text-dim',
  'text-faint',
  'accent',
  'accent-hover',
  'accent-soft',
  'accent-border',
  'danger',
  'star',
  'now-line',
] as const

export interface Theme {
  id: string
  name: string
  mode: 'dark' | 'light'
  tokens: ThemeTokens
}

export const THEMES: Theme[] = [
  {
    id: 'default-dark',
    name: 'Default Dark',
    mode: 'dark',
    tokens: {
      'bg-0': '#0b0d12', 'bg-1': '#11141b', 'bg-2': '#181d27', 'bg-3': '#222836',
      'border': '#262d3c', 'border-strong': '#38415a',
      'text': '#e7eaf2', 'text-dim': '#9aa3b8', 'text-faint': '#626b80',
      'accent': '#5b8cff', 'accent-hover': '#7aa3ff',
      'accent-soft': 'rgba(91,140,255,0.16)', 'accent-border': 'rgba(91,140,255,0.55)',
      'danger': '#f0606b', 'star': '#f5c451', 'now-line': '#ff5964',
    },
  },
  {
    id: 'default-light',
    name: 'Default Light',
    mode: 'light',
    tokens: {
      'bg-0': '#f4f6fa', 'bg-1': '#ffffff', 'bg-2': '#eef1f6', 'bg-3': '#e2e7f0',
      'border': '#d9dee9', 'border-strong': '#b9c2d4',
      'text': '#1d2433', 'text-dim': '#5b6478', 'text-faint': '#8a92a6',
      'accent': '#3b6ae0', 'accent-hover': '#2f57bd',
      'accent-soft': 'rgba(59,106,224,0.12)', 'accent-border': 'rgba(59,106,224,0.5)',
      'danger': '#d64550', 'star': '#cf9a2f', 'now-line': '#e5484d',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    mode: 'dark',
    tokens: {
      'bg-0': '#181825', 'bg-1': '#1e1e2e', 'bg-2': '#313244', 'bg-3': '#45475a',
      'border': '#313244', 'border-strong': '#585b70',
      'text': '#cdd6f4', 'text-dim': '#a6adc8', 'text-faint': '#7f849c',
      'accent': '#89b4fa', 'accent-hover': '#74c7ec',
      'accent-soft': 'rgba(137,180,250,0.16)', 'accent-border': 'rgba(137,180,250,0.55)',
      'danger': '#f38ba8', 'star': '#f9e2af', 'now-line': '#eba0ac',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    mode: 'dark',
    tokens: {
      'bg-0': '#2e3440', 'bg-1': '#333b48', 'bg-2': '#3b4252', 'bg-3': '#434c5e',
      'border': '#3b4252', 'border-strong': '#4c566a',
      'text': '#eceff4', 'text-dim': '#d8dee9', 'text-faint': '#9aa5b8',
      'accent': '#88c0d0', 'accent-hover': '#8fbcbb',
      'accent-soft': 'rgba(136,192,208,0.18)', 'accent-border': 'rgba(136,192,208,0.55)',
      'danger': '#bf616a', 'star': '#ebcb8b', 'now-line': '#bf616a',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    mode: 'dark',
    tokens: {
      'bg-0': '#21222c', 'bg-1': '#282a36', 'bg-2': '#343746', 'bg-3': '#44475a',
      'border': '#343746', 'border-strong': '#6272a4',
      'text': '#f8f8f2', 'text-dim': '#c0c2d8', 'text-faint': '#6272a4',
      'accent': '#bd93f9', 'accent-hover': '#ff79c6',
      'accent-soft': 'rgba(189,147,249,0.18)', 'accent-border': 'rgba(189,147,249,0.55)',
      'danger': '#ff5555', 'star': '#f1fa8c', 'now-line': '#ff5555',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    mode: 'dark',
    tokens: {
      'bg-0': '#16161e', 'bg-1': '#1a1b26', 'bg-2': '#22232e', 'bg-3': '#292e42',
      'border': '#232433', 'border-strong': '#3b4261',
      'text': '#c0caf5', 'text-dim': '#9aa5ce', 'text-faint': '#565f89',
      'accent': '#7aa2f7', 'accent-hover': '#7dcfff',
      'accent-soft': 'rgba(122,162,247,0.18)', 'accent-border': 'rgba(122,162,247,0.55)',
      'danger': '#f7768e', 'star': '#e0af68', 'now-line': '#f7768e',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    mode: 'dark',
    tokens: {
      'bg-0': '#191724', 'bg-1': '#1f1d2e', 'bg-2': '#26233a', 'bg-3': '#302d47',
      'border': '#26233a', 'border-strong': '#44415a',
      'text': '#e0def4', 'text-dim': '#908caa', 'text-faint': '#6e6a86',
      'accent': '#c4a7e7', 'accent-hover': '#9ccfd8',
      'accent-soft': 'rgba(196,167,231,0.16)', 'accent-border': 'rgba(196,167,231,0.55)',
      'danger': '#eb6f92', 'star': '#f6c177', 'now-line': '#eb6f92',
    },
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    mode: 'light',
    tokens: {
      'bg-0': '#f2e9e1', 'bg-1': '#fffaf3', 'bg-2': '#faf4ed', 'bg-3': '#efe6dc',
      'border': '#e5dccf', 'border-strong': '#cabfb3',
      'text': '#575279', 'text-dim': '#797593', 'text-faint': '#9893a5',
      'accent': '#907aa9', 'accent-hover': '#56949f',
      'accent-soft': 'rgba(144,122,169,0.14)', 'accent-border': 'rgba(144,122,169,0.5)',
      'danger': '#b4637a', 'star': '#ea9d34', 'now-line': '#b4637a',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    mode: 'light',
    tokens: {
      'bg-0': '#eee8d5', 'bg-1': '#fdf6e3', 'bg-2': '#eee8d5', 'bg-3': '#e3ddc9',
      'border': '#ddd6c1', 'border-strong': '#c9c2ad',
      'text': '#586e75', 'text-dim': '#657b83', 'text-faint': '#93a1a1',
      'accent': '#268bd2', 'accent-hover': '#2076b8',
      'accent-soft': 'rgba(38,139,210,0.14)', 'accent-border': 'rgba(38,139,210,0.5)',
      'danger': '#dc322f', 'star': '#b58900', 'now-line': '#dc322f',
    },
  },
]

export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]))

// Apply a theme by id. 'system' clears the inline overrides so index.css's
// prefers-color-scheme rules drive light/dark from the OS again. 'custom' uses
// the passed token map. Any token missing from a custom map keeps whatever the
// stylesheet provides.
export function applyTheme(themeId: string, customTokens?: ThemeTokens | null): void {
  const root = document.documentElement
  if (themeId === 'system') {
    for (const token of THEME_TOKENS) root.style.removeProperty(`--${token}`)
    root.style.removeProperty('color-scheme')
    return
  }
  const tokens = themeId === 'custom' ? customTokens : THEME_BY_ID.get(themeId)?.tokens
  if (!tokens) return
  for (const token of THEME_TOKENS) {
    if (tokens[token]) root.style.setProperty(`--${token}`, tokens[token])
  }
  const mode = THEME_BY_ID.get(themeId)?.mode
  if (mode) root.style.colorScheme = mode
  else root.style.removeProperty('color-scheme')
}
