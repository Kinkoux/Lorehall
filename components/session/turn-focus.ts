/**
 * Who is acting right now, and who acts after them, in an initiative order.
 *
 * The play bar and the initiative list have to agree: the list highlights the
 * row at `turnIndex` and nothing else, so a pointer left out of range names
 * nobody here either, rather than naming the wrong creature to the whole table.
 */
export function turnFocus<T extends { name: string }>(
  order: readonly T[],
  turnIndex: number
): { current: T | null; next: T | null } {
  const current = order[turnIndex] ?? null;
  if (current === null) return { current: null, next: null };
  // The order is a ring: after the last row, the next turn is the top again.
  return { current, next: order[(turnIndex + 1) % order.length] ?? null };
}
