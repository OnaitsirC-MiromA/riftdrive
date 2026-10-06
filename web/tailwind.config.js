/** @type {import('tailwindcss').Config} */
// Tokens do DESIGN.md. Tema escuro por padrão: a tinta é o palco, a superfície
// levanta os cartões, o violeta é a ação (o rift), o âmbar é cota/aviso/"pela
// sua máquina", o verde é concluído.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B1020',
        surface: '#141A33',
        surface2: '#1B2240',
        line: 'rgba(255,255,255,0.08)',
        fg: '#F5F3FF',
        muted: 'rgba(245,243,255,0.62)',
        faint: 'rgba(245,243,255,0.4)',
        violet: { DEFAULT: '#A78BFA', strong: '#C4B5FD' },
        cyan: '#67E8F9',
        amber: '#F2B134',
        green: '#34D399',
        red: '#F87171',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { md: '8px', lg: '10px', xl: '14px' },
      boxShadow: { card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.25)' },
    },
  },
  plugins: [],
};
