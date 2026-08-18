/**
 * Cache invalidation is a no-op under test: the actions call it on the way out
 * and nothing here renders. Declared without parameters on purpose — call
 * sites are still type-checked against the real `next/cache` declarations,
 * and extra arguments are simply ignored at runtime.
 */
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_noStore() {}
