// `server-only` has no on-disk implementation here — Next aliases it during
// its own build. Tests run the same modules outside Next, so the import has to
// resolve to something inert.
export {};
