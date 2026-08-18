/**
 * `redirect()` throws in Next too — the difference is only which error. Tests
 * that expect a bounce assert on this message.
 */
export const REDIRECT_MESSAGE = "TEST_REDIRECT";

export function redirect(url?: string): never {
  throw new Error(`${REDIRECT_MESSAGE}:${url ?? ""}`);
}

export function permanentRedirect(url?: string): never {
  throw new Error(`${REDIRECT_MESSAGE}:${url ?? ""}`);
}

export function notFound(): never {
  throw new Error("TEST_NOT_FOUND");
}
