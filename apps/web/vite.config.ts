import { installedRoot, privateRoot } from '../server/src/core/discovery.ts';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// HUB_COMPILER_LOG=1 lists the components the compiler skips and why (run once after a big change).
const compilerLogger = {
  logEvent(filename: string | null, event: { kind: string; detail?: unknown; reason?: string }) {
    if (event.kind !== 'CompileSuccess')
      console.warn('[react-compiler]', event.kind, filename, JSON.stringify(event.detail ?? event.reason));
  },
};

const licensesFile = 'third-party-licenses.md';

// Vite lists only packages with JS from node_modules. These ship too: the self-hosted font arrives through CSS (the
// OFL asks for its notice to travel with the font), and the Hairline components are vendored into src.
const extraNotices = [
  { title: '@fontsource-variable/urbanist (OFL-1.1)', file: './node_modules/@fontsource-variable/urbanist/LICENSE' },
  {
    title: '@fontsource-variable/jetbrains-mono (OFL-1.1)',
    file: './node_modules/@fontsource-variable/jetbrains-mono/LICENSE',
  },
  { title: 'Hairline UI, vendored in src/components/ui (MIT)', file: './src/components/ui/LICENSE' },
  // rough-notation ships roughjs inlined (a devDependency it bundled), so the bundler sees one package and one notice.
  { title: 'roughjs 4.3.1, inlined in rough-notation (MIT)', file: './third-party/roughjs-LICENSE' },
];

function extraLicenses(): Plugin {
  return {
    name: 'hub:extra-licenses',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const notices = bundle[licensesFile];
        if (notices?.type !== 'asset') return;
        const sections = extraNotices.map(
          ({ title, file }) => `\n## ${title}\n\n${readFileSync(new URL(file, import.meta.url), 'utf8').trim()}\n`,
        );
        notices.source = String(notices.source) + sections.join('');
      },
    },
  };
}

function reactDevtoolsMcp(): Plugin {
  return {
    name: 'hub:react-devtools-cdt-mcp',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: "import 'react-devtools-cdt-mcp/register';",
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const emptyInstalledRoot = fileURLToPath(new URL('./node_modules/.hub-no-installed-modules', import.meta.url));

export default defineConfig({
  // e2e runs with different module roots at the same time: one dep cache per variant (`apps/e2e/playwright.config.ts`).
  cacheDir: process.env.HUB_VITE_CACHE,
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@phosphor-icons/react': fileURLToPath(new URL('./node_modules/@phosphor-icons/react', import.meta.url)),
      'motion/react': fileURLToPath(new URL('./node_modules/motion/react', import.meta.url)),
      '@tanstack/react-query': fileURLToPath(new URL('./node_modules/@tanstack/react-query', import.meta.url)),
      '@tanstack/react-router': fileURLToPath(new URL('./node_modules/@tanstack/react-router', import.meta.url)),
      '@trpc/tanstack-react-query': fileURLToPath(
        new URL('./node_modules/@trpc/tanstack-react-query', import.meta.url),
      ),
      motion: fileURLToPath(new URL('./node_modules/motion', import.meta.url)),
      'rough-notation': fileURLToPath(new URL('./node_modules/rough-notation', import.meta.url)),
      // No leading slash: Vite joins a glob that starts with '/' to the project root and never applies the alias.
      '@hub-private-modules': process.env.HUB_MODULES_ROOT ?? privateRoot,
      '@hub-installed-modules':
        process.env.HUB_INSTALLED_MODULES_ROOT ?? (process.env.HUB_MODULES_ROOT ? emptyInstalledRoot : installedRoot),
    },
  },
  // Notices for the packages shipped in the bundle, generated from exactly what was bundled (plus the font below).
  build: { license: { fileName: licensesFile } },
  define: { 'import.meta.env.HUB_EXAMPLE_MODULES': JSON.stringify(process.env.HUB_EXAMPLE_MODULES ?? '0') },
  plugins: [
    reactDevtoolsMcp(),
    // Must run before react() or route generation and code splitting fail silently.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    // React Compiler: components are memoized for us, so no hand-written useMemo/useCallback/memo.
    babel({ presets: [reactCompilerPreset(process.env.HUB_COMPILER_LOG ? { logger: compilerLogger } : undefined)] }),
    tailwindcss(),
    extraLicenses(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      // Italian only; Paraglide is here to keep copy out of components, not for translation.
      strategy: ['baseLocale'],
    }),
  ],
  // `ws: true` forwards the WebSocket upgrade of the tRPC subscriptions along with the Origin header the server checks.
  server: {
    proxy: {
      '/files': { target: `http://127.0.0.1:${process.env.HUB_PORT ?? 4180}` },
      '/music': { target: `http://127.0.0.1:${process.env.HUB_PORT ?? 4180}` },
      '/trpc': { target: `http://127.0.0.1:${process.env.HUB_PORT ?? 4180}`, ws: true },
    },
  },
});
