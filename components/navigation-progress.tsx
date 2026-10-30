"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Bar = { value: number; leaving: boolean } | null;

/**
 * Thin gold line at the top while the next page loads. It starts on a click on
 * an internal link (or a GET form such as a filter), creeps towards 90 % and
 * finishes when the URL changes. Quick navigations never show it.
 */
function Progress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [bar, setBar] = useState<Bar>(null);
  const active = useRef(false);
  const timers = useRef<number[]>([]);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      timers.current = [];
    };
    const finish = () => {
      if (!active.current) return;
      active.current = false;
      clear();
      setBar((current) => (current ? { value: 100, leaving: false } : null));
      timers.current.push(
        window.setTimeout(() => setBar((c) => (c ? { ...c, leaving: true } : null)), 200),
        window.setTimeout(() => setBar(null), 450),
      );
    };
    const start = () => {
      clear();
      active.current = true;
      timers.current.push(
        window.setTimeout(() => {
          setBar({ value: 15, leaving: false });
          timers.current.push(
            window.setInterval(
              () => setBar((c) => (c ? { ...c, value: c.value + (90 - c.value) * 0.08 } : c)),
              200,
            ),
          );
        }, 120),
        // Never hang around if the navigation was cancelled.
        window.setTimeout(finish, 12000),
      );
    };
    finishRef.current = finish;

    const isNewPage = (url: URL) =>
      url.origin === location.origin &&
      (url.pathname !== location.pathname || url.search !== location.search);

    // Capture phase: runs before <Link> handles the click and cancels the event.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      if (link.dataset.noProgress !== undefined) return;
      if (isNewPage(new URL(link.href, location.href))) start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return;
      const action = form.getAttribute("action");
      if (action && !action.startsWith("javascript:")) start();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
      clear();
    };
  }, []);

  useEffect(() => {
    finishRef.current();
  }, [pathname, search]);

  if (!bar) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] print:hidden"
      style={{ opacity: bar.leaving ? 0 : 1, transition: "opacity 250ms ease" }}
    >
      <div
        className="h-full rounded-r-full bg-gold-500 shadow-[0_0_8px_var(--color-gold-400)]"
        style={{ width: `${bar.value}%`, transition: "width 200ms ease-out" }}
      />
    </div>
  );
}

export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary so static pages can still prerender.
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
