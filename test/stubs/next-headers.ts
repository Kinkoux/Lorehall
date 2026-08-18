/**
 * A request-scoped cookie jar with no request. `lib/locale.ts` and
 * `lib/auth.ts` read cookies at module boundaries the actions cross; an empty
 * store is enough — the tests drive the signed-in user through the `@/lib/auth`
 * mock instead of through a real cookie.
 */
const store = new Map<string, string>();

/** Seed a cookie for a test that cares (e.g. locale selection). */
export function __setCookie(name: string, value: string) {
  store.set(name, value);
}

export function __clearCookies() {
  store.clear();
}

export async function cookies() {
  return {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...store].map(([name, value]) => ({ name, value }));
    },
    has(name: string) {
      return store.has(name);
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}

export async function headers() {
  return new Headers();
}
