const source = /\.(?:[cm]?[jt]sx?|json|css)$/;
// index.css names the private root for Tailwind: it only scans apps/web, so a utility used by a private module's UI would not compile.
const discovery = new Set([
  'apps/server/src/core/discovery.ts',
  'apps/web/src/lib/modules.ts',
  'apps/web/src/index.css',
]);
const privatePath = /(?:^|[/'"`])modules\.local\//;

/** Source/config paths are forbidden, while prose documenting the module contract is allowed. */
export function moduleImportViolation(file: string, content: string) {
  return source.test(file) && !discovery.has(file) && privatePath.test(content);
}

export function ignoresModules(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  return (
    lines.some((line) => /^\/?modules(?:\[\.\]|\.)local\/$/.test(line)) &&
    !lines.some((line) => line.startsWith('!') && /modules(?:\[\.\]|\.)local/.test(line))
  );
}
