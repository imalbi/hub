const source = /\.(?:[cm]?[jt]sx?|json|css)$/;
// index.css names the private/installed roots for Tailwind: it only scans apps/web, so a utility used by a discovered module's UI would not compile.
const discovery = new Set([
  'apps/server/src/core/discovery.ts',
  'apps/web/src/lib/modules.ts',
  'apps/web/src/index.css',
]);
const privatePath = /(?:^|[/'"`])modules\.(?:local|installed|repos)\//;
const managedDirs = ['local', 'installed', 'repos'] as const;

/** Source/config paths are forbidden, while prose documenting the module contract is allowed. */
export function moduleImportViolation(file: string, content: string) {
  return source.test(file) && !discovery.has(file) && privatePath.test(content);
}

export function ignoresModules(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  return managedDirs.every((suffix) => {
    const pattern = new RegExp(`^\\/?modules(?:\\[\\.\\]|\\.)${suffix}\\/?$`);
    const negated = new RegExp(`modules(?:\\[\\.\\]|\\.)${suffix}`);
    return (
      lines.some((line) => pattern.test(line)) && !lines.some((line) => line.startsWith('!') && negated.test(line))
    );
  });
}
