"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Motion helpers for the public site. Everything degrades to "just visible" when
 * JavaScript is off or the visitor prefers reduced motion.
 */

/** Adds `.in` once the element scrolls into view; CSS handles the animation. */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "p" | "h1" | "h2" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp = Tag as any;
  return (
    <Comp ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Comp>
  );
}

/**
 * Scroll effects: marks <html data-scrolled> once past the hero top so the header
 * goes solid, drives the read-progress line, and feeds a parallax offset to the hero video.
 */
export function ScrollFx() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js");
    const bar = document.querySelector<HTMLElement>(".progress-line");
    const hero = document.querySelector<HTMLElement>(".hero-video");
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      root.dataset.scrolled = y > 40 ? "true" : "false";
      if (bar) {
        const max = root.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }
      if (hero) hero.style.setProperty("--py", `${Math.min(y, 1200) * 0.25}px`);
      // Anchor jumps can skip past elements without ever intersecting the viewport;
      // anything at or above the fold is revealed here so nothing stays hidden.
      const limit = window.innerHeight * 0.92;
      document.querySelectorAll<HTMLElement>(".reveal:not(.in)").forEach((el) => {
        if (el.getBoundingClientRect().top < limit) el.classList.add("in");
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div className="progress-line" aria-hidden="true" />;
}

/** Rising embers over the oven. Deterministic values so server and client render the same markup. */
export function Embers({ count = 26 }: { count?: number }) {
  const embers = Array.from({ length: count }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const r = (n: number) => ((seed * (n + 1)) % 1000) / 1000;
    return {
      left: 8 + r(1) * 84,
      size: 2 + r(2) * 3,
      dur: 6 + r(3) * 8,
      delay: -r(4) * 14,
      drift: (r(5) - 0.5) * 120,
      glow: r(6) > 0.6,
    };
  });
  return (
    <div className="embers" aria-hidden="true">
      {embers.map((e, i) => (
        <span
          key={i}
          className={`ember ${e.glow ? "ember-hot" : ""}`}
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDuration: `${e.dur}s`,
            animationDelay: `${e.delay}s`,
            ["--drift" as string]: `${e.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

/** A number that counts up from zero when it scrolls into view. */
export function CountUp({ to, className = "" }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.textContent = String(to);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const dur = 900;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(to * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
