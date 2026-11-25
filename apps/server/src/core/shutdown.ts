/** Share the same deadline for signals and settings restarts, leaving time before systemd's 20 s stop limit. */
export function createShutdown(close: () => Promise<unknown>, logError: (error: unknown) => void) {
  let closing = false;
  return (exitCode = 0) => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 15_000);
    void close().then(
      () => {
        clearTimeout(deadline);
        process.exit(exitCode);
      },
      (error: unknown) => {
        clearTimeout(deadline);
        logError(error);
        process.exit(1);
      },
    );
  };
}
