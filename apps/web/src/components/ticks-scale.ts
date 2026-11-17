export function tickScale(value: number, total: number) {
  const count = Math.max(0, Math.floor(total));
  return { count, filled: Math.min(count, Math.max(0, Math.floor(value))) };
}
