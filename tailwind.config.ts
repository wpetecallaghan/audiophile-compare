import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'media',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Semantic color tokens (build step 83) — see components.md §12.
        muted: "var(--muted)",
        body: "var(--body)",
        border: "var(--border)",
        divider: "var(--divider)",
        ink: "var(--ink)",
        "ink-foreground": "var(--ink-foreground)",
        danger: "var(--danger)",
        "status-win": "var(--status-win)",
        "status-loss": "var(--status-loss)",
        warning: "var(--warning)",
        "warning-bg": "var(--warning-bg)",
        "warning-foreground": "var(--warning-foreground)",
        info: "var(--info)",
        "info-bg": "var(--info-bg)",
        "info-foreground": "var(--info-foreground)",
        // Added build step 84.
        "hover-surface": "var(--hover-surface)",
        link: "var(--link)",
      },
    },
  },
  plugins: [],
};
export default config;
