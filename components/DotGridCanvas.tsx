"use client";

import { useEffect, useRef } from "react";

const GRID_SIZE = 17;
const DOT_RADIUS = 1;
const TRAIL_RADIUS = 120;
const OVERSCAN = TRAIL_RADIUS * 1.75;
const LIGHT_DOT_COLOR = "#b9b9b9";
const DARK_DOT_COLOR = "rgba(61, 61, 61, 0.9)";
// Base per-frame trail decay; strong trails decay slower (up to TRAIL_DECAY_MAX)
const TRAIL_DECAY = 0.895;
const TRAIL_DECAY_MAX = 0.975;
// Frame movement (px) at which the trail reaches full density
const FULL_DENSITY_DIST = 30;
const MAX_OFFSET = 44;
const MAX_DENSITY = 14;
const NOISE_AMPLITUDE = 0.25;
const OFFSET_EASE = 0.15;
// Ambient swell: dots grow/shrink as slow waves travel across the grid
const SWELL_MIN = 0.55;
const SWELL_MAX = 1.36;
const SWELL_LIFT = 4;

type Dot = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  density: number;
  seedX: number;
  seedY: number;
  r: number;
};

const smoothstep = (edge: number, x: number) => {
  const t = Math.min(Math.max(x / edge, 0), 1);
  return t * t * (3 - 2 * t);
};

export default function DotGridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dotColor = "#e5e5e5";
    let raf = 0;
    let running = false;
    const mouse = { x: -1e4, y: -1e4 };
    const prev = { x: -1e4, y: -1e4 };

    const readColor = () => {
      dotColor = document.documentElement.classList.contains("dark")
        ? DARK_DOT_COLOR
        : LIGHT_DOT_COLOR;
    };

    const buildDots = () => {
      dots = [];
      for (
        let y = GRID_SIZE / 2 - OVERSCAN;
        y < height + OVERSCAN;
        y += GRID_SIZE
      ) {
        for (
          let x = GRID_SIZE / 2 - OVERSCAN;
          x < width + OVERSCAN;
          x += GRID_SIZE
        ) {
          dots.push({
            homeX: x,
            homeY: y,
            x,
            y,
            dirX: 0,
            dirY: 0,
            density: 0,
            seedX: Math.random() * Math.PI * 2,
            seedY: Math.random() * Math.PI * 2,
            r: DOT_RADIUS,
          });
        }
      }
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      buildDots();
      draw();
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = dotColor;
      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      const now = performance.now() / 1000;
      const mouseActive = mouse.x > -1e3 && prev.x > -1e3;
      const segX = mouseActive ? mouse.x - prev.x : 0;
      const segY = mouseActive ? mouse.y - prev.y : 0;
      const segLen = Math.hypot(segX, segY);
      const dirX = segLen > 0 ? segX / segLen : 1;
      const dirY = segLen > 0 ? segY / segLen : 0;
      // Trail width scales with mouse speed: narrow when slow, wide when fast
      const radius =
        TRAIL_RADIUS *
        (0.5 + Math.min(segLen / (FULL_DENSITY_DIST / 2), 2.5) * 0.5);
      for (const dot of dots) {
        // Decay the stored trail field; stronger trails linger longer
        const decay =
          TRAIL_DECAY +
          (TRAIL_DECAY_MAX - TRAIL_DECAY) *
            Math.min(dot.density / MAX_DENSITY, 1);
        dot.dirX *= decay;
        dot.dirY *= decay;
        dot.density *= decay;

        // Inject density along the segment the mouse swept this frame
        if (mouseActive && segLen > 0) {
          const t = Math.min(
            Math.max(
              ((dot.homeX - prev.x) * segX + (dot.homeY - prev.y) * segY) /
                (segLen * segLen),
              0,
            ),
            1,
          );
          const cx = prev.x + segX * t;
          const cy = prev.y + segY * t;
          const distToLine = Math.hypot(dot.homeX - cx, dot.homeY - cy);
          let s = 1 - smoothstep(radius, distToLine);
          s *= s;
          const current =
            Math.min(MAX_DENSITY, segLen / (FULL_DENSITY_DIST / 3)) * s;
          if (current > 0) {
            dot.dirX += dirX * current;
            dot.dirY += dirY * current;
            dot.density = Math.max(dot.density, current);
          }
        }

        // Displace along the trail direction, with noise scaled by strength
        const strength = Math.min(dot.density, MAX_DENSITY);
        let targetX = dot.homeX;
        let targetY = dot.homeY;
        if (strength > 0.001) {
          const dLen = Math.hypot(dot.dirX, dot.dirY);
          const nx = dLen > 0 ? dot.dirX / dLen : 0;
          const ny = dLen > 0 ? dot.dirY / dLen : 0;
          const wobbleX =
            Math.sin(now * 6 + dot.seedX + strength * 3) * NOISE_AMPLITUDE;
          const wobbleY =
            Math.sin(now * 6 * 1.3 + dot.seedY + strength * 3) *
            NOISE_AMPLITUDE;
          targetX = dot.homeX + (nx + wobbleX) * strength * MAX_OFFSET;
          targetY = dot.homeY + (ny + wobbleY) * strength * MAX_OFFSET;
        }
        // Ambient swell traveling across the grid, like something moving underneath
        const wave =
          Math.sin(dot.homeX * 0.012 + now * 0.9) *
            Math.sin(dot.homeY * 0.011 - now * 0.55) *
            0.5 +
          Math.sin((dot.homeX + dot.homeY) * 0.006 + now * 0.7) * 0.5;
        const swell = (wave + 1) / 2;
        dot.r = DOT_RADIUS * (SWELL_MIN + (SWELL_MAX - SWELL_MIN) * swell);
        targetY -= swell * SWELL_LIFT;

        // Farther-flung dots ease back more slowly
        const disp = Math.hypot(dot.x - dot.homeX, dot.y - dot.homeY);
        const ease = OFFSET_EASE / (1 + disp / 80);
        dot.x += (targetX - dot.x) * ease;
        dot.y += (targetY - dot.y) * ease;

      }

      prev.x = mouse.x;
      prev.y = mouse.y;
      draw();
      raf = requestAnimationFrame(step);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    // Ambient swell runs continuously; pause when off-screen
    const visObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        wake();
      } else {
        cancelAnimationFrame(raf);
        running = false;
      }
    });
    visObserver.observe(parent);

    const onPointerMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (mouse.x < -1e3) {
        prev.x = x;
        prev.y = y;
      }
      mouse.x = x;
      mouse.y = y;
    };

    const onPointerLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
      prev.x = -1e4;
      prev.y = -1e4;
    };

    readColor();
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);

    const themeObserver = new MutationObserver(() => {
      readColor();
      draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    parent.addEventListener("pointermove", onPointerMove);
    parent.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      visObserver.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      parent.removeEventListener("pointermove", onPointerMove);
      parent.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
