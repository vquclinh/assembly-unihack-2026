"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A pretend mouse pointer for the judge demo's autoplay. Before each step it glides to the
 * button that step stands for, inside that person's app window, and "presses" it, so viewers
 * can see what was clicked and by whom.
 */
export type DemoCursorHandle = {
  /** Points at `[data-demo=target]` in the frame and presses it. Returns a function that clears the highlight and hides the pointer. */
  press: (getFrame: () => HTMLIFrameElement | null, target: string, who: string, patienceMs?: number) => Promise<() => void>;
  hide: () => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function findTarget(getFrame: () => HTMLIFrameElement | null, target: string, patienceMs: number) {
  // The window may not exist yet or still be loading (first step), or be refreshing after the
  // previous step: give the button time to appear.
  for (let waited = 0; waited <= patienceMs; waited += 200) {
    const frame = getFrame();
    const el = frame?.contentDocument?.querySelector<HTMLElement>(`[data-demo="${target}"]`);
    if (frame && el && el.offsetParent !== null) return { frame, el };
    await sleep(200);
  }
  const frame = getFrame();
  return frame ? { frame, el: null } : null;
}

export const DemoCursor = forwardRef<DemoCursorHandle>(function DemoCursor(_, ref) {
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  // Rendered into <body>: a transformed ancestor would otherwise pin "fixed" to itself, not the window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // A fixed pointer would drift off its button when the page scrolls, so it fades out instead.
    const onScroll = () => {
      if (box.current && !box.current.dataset.moving) box.current.style.opacity = "0";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useImperativeHandle(ref, () => ({
    hide() {
      if (box.current) box.current.style.opacity = "0";
    },
    async press(getFrame, target, who, patienceMs = 6000) {
      const b = box.current;
      if (!b) return () => {};
      const fast = reduced();
      b.dataset.moving = "1";
      try {
        const found = await findTarget(getFrame, target, patienceMs);
        if (!found) return () => {};
        const { frame, el } = found;
        if (el) {
          // Scroll only inside the person's window (scrollIntoView would also scroll this page and
          // push the step list away), putting the button about a third of the way down.
          const win = frame.contentWindow;
          const r = el.getBoundingClientRect();
          if (win && (r.top < 40 || r.bottom > frame.clientHeight - 40)) {
            win.scrollTo({ top: win.scrollY + r.top - frame.clientHeight * 0.35, behavior: fast ? "auto" : "smooth" });
            await sleep(fast ? 50 : 500);
          }
        }
        const point = () => {
          const f = frame.getBoundingClientRect();
          if (!el) return { x: f.left + f.width / 2, y: Math.max(f.top, 0) + 120 };
          const r = el.getBoundingClientRect();
          return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };
        };
        let p = point();
        if (p.y < 90 || p.y > window.innerHeight - 70) {
          window.scrollBy({ top: p.y - window.innerHeight / 2, behavior: fast ? "auto" : "smooth" });
          await sleep(fast ? 50 : 600);
          p = point();
        }
        if (label.current) {
          label.current.textContent = el ? `${who} · “${el.innerText.trim().split("\n")[0].replace(/\s*\(.*?\)/g, "")}”` : who;
          // Keep the caption on screen next to the right-hand panel.
          const flip = p.x > window.innerWidth - 300;
          label.current.style.left = flip ? "auto" : "";
          label.current.style.right = flip ? "4px" : "";
        }
        b.style.opacity = "1";
        b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        await sleep(fast ? 50 : 850);
        b.dataset.press = "1";
        if (el) {
          el.style.outline = "3px solid #f87171";
          el.style.outlineOffset = "3px";
          el.style.transform = "scale(0.96)";
        }
        await sleep(fast ? 50 : 200);
        if (el) el.style.transform = "";
        setTimeout(() => delete b.dataset.press, 650);
        return () => {
          // The window re-renders once the step lands, so the pointer would end up over something else.
          b.style.opacity = "0";
          if (!el) return;
          el.style.outline = "";
          el.style.outlineOffset = "";
        };
      } finally {
        // Let the smooth scroll settle before scroll events may hide the pointer again.
        setTimeout(() => delete b.dataset.moving, 300);
      }
    },
  }));

  if (!mounted) return null;
  return createPortal(
    <div ref={box} aria-hidden className="demo-cursor pointer-events-none fixed left-0 top-0 z-[60] opacity-0" style={{ transform: "translate(70vw, 90vh)" }}>
      <span className="demo-cursor-ripple absolute left-0 top-0 h-10 w-10 rounded-full border-2 border-brand-400" />
      <svg className="demo-cursor-arrow relative -ml-[3px] -mt-[2px] h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" viewBox="0 0 24 24">
        <path d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.6 20.7 L11.7 14.2 L18 14.2 Z" fill="white" stroke="#18181b" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span ref={label} className="absolute left-6 top-7 whitespace-nowrap bg-brand-500 px-2 py-1 text-xs font-bold text-white shadow-lg" />
    </div>,
    document.body,
  );
});
