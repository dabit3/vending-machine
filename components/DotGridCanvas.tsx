"use client";

import { useEffect, useRef } from "react";

const GRID_SIZE = 17;
const DOT_RADIUS = 1;
const TRAIL_RADIUS = 120;
const OVERSCAN = TRAIL_RADIUS * 1.75;
const LIGHT_DOT_COLOR = "rgba(185, 185, 185, 0.85)";
const DARK_DOT_COLOR = "rgba(61, 61, 61, 0.765)";
// Impulse physics: the mouse imparts velocity kicks scaled by its speed
const IMPULSE = 1.1;
const MAX_SPEED = 120;
const FRICTION = 0.9;
const SPRING = 0.015;
// Ambient swell: dots grow/shrink as slow waves travel across the grid
const SWELL_MIN = 0.55;
const SWELL_MAX = 1.36;
const SWELL_LIFT = 4;
// Dots drift counter to the swell wave's direction of travel
const DRIFT_AMPLITUDE = 6;

type Dot = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
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
            vx: 0,
            vy: 0,
            seed: Math.random() * Math.PI * 2,
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
      // Wider swath when the mouse moves fast
      const radius = TRAIL_RADIUS * (0.5 + Math.min(segLen / 15, 2) * 0.5);
      for (const dot of dots) {
        // Velocity kick from the segment the mouse swept this frame
        if (mouseActive && segLen > 0) {
          const t = Math.min(
            Math.max(
              ((dot.x - prev.x) * segX + (dot.y - prev.y) * segY) /
                (segLen * segLen),
              0,
            ),
            1,
          );
          const cx = prev.x + segX * t;
          const cy = prev.y + segY * t;
          const dx = dot.x - cx;
          const dy = dot.y - cy;
          const distToLine = Math.hypot(dx, dy);
          let s = 1 - smoothstep(radius, distToLine);
          s *= s;
          if (s > 0) {
            const rx = distToLine > 0 ? dx / distToLine : 0;
            const ry = distToLine > 0 ? dy / distToLine : 0;
            const kick = segLen * IMPULSE * s;
            // Push along the mouse's travel plus radially away from its path
            dot.vx += (dirX * 0.7 + rx * 0.8) * kick;
            dot.vy += (dirY * 0.7 + ry * 0.8) * kick;
            const speed = Math.hypot(dot.vx, dot.vy);
            if (speed > MAX_SPEED) {
              dot.vx *= MAX_SPEED / speed;
              dot.vy *= MAX_SPEED / speed;
            }
          }
        }

        let targetX = dot.homeX;
        let targetY = dot.homeY;
        // Ambient swell traveling across the grid, like something moving underneath
        const wave =
          Math.sin(dot.homeX * 0.012 + now * 1.35) *
            Math.sin(dot.homeY * 0.011 - now * 1.44) *
            0.5 +
          Math.sin((dot.homeX + dot.homeY) * 0.006 + now * 1.05) * 0.5;
        const swell = (wave + 1) / 2;
        dot.r = DOT_RADIUS * (SWELL_MIN + (SWELL_MAX - SWELL_MIN) * swell);
        targetY -= swell * SWELL_LIFT;
        // Positional drift counter to the swell's travel direction
        targetX +=
          Math.cos(dot.homeX * 0.012 + now * 0.9) * DRIFT_AMPLITUDE;
        targetY +=
          Math.cos(dot.homeY * 0.011 - now * 0.96) * DRIFT_AMPLITUDE * 0.6;

        // Integrate: soft spring back toward the ambient target, with friction
        dot.vx += (targetX - dot.x) * SPRING;
        dot.vy += (targetY - dot.y) * SPRING;
        dot.vx *= FRICTION;
        dot.vy *= FRICTION;
        dot.x += dot.vx;
        dot.y += dot.vy;

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
