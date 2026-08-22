"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server component tree on an interval so everyone at the
 *  table sees the same initiative order without touching anything. */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      // Don't refresh under the user's fingers: typing in a form, or an open
      // <details> that holds one (e.g. "End session"), would get disrupted.
      // A fold with nothing to fill in — the battle map — is only a view, and
      // the table would rather it kept up with the session than sat frozen.
      const active = document.activeElement?.tagName;
      if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
      const holdsAForm = Array.from(document.querySelectorAll("details[open]")).some((panel) =>
        // Asked by exclusion, not by [type=submit]: a <button> with the
        // attribute left off submits all the same, and one forgotten word in
        // some future panel would be enough to have the refresh go off under a
        // half-finished confirmation.
        panel.querySelector("input, select, textarea, button:not([type=button]):not([type=reset])")
      );
      if (holdsAForm) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
