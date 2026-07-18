"use client";

import { useEffect, useRef } from "react";

const GRID_SIZE = 28;
const DOT_RADIUS = 1;
const ATTRACT_RADIUS = 200;
const ATTRACT_STRENGTH = 0.55;
const EASE = 0.12;

type Dot = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
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

    const readColor = () => {
      dotColor =
        getComputedStyle(parent).getPropertyValue("--border").trim() ||
        dotColor;
    };

    const buildDots = () => {
      dots = [];
      for (let y = GRID_SIZE / 2; y < height + GRID_SIZE; y += GRID_SIZE) {
        for (let x = GRID_SIZE / 2; x < width + GRID_SIZE; x += GRID_SIZE) {
          dots.push({ homeX: x, homeY: y, x, y });
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
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      let settled = true;
      for (const dot of dots) {
        const dx = mouse.x - dot.homeX;
        const dy = mouse.y - dot.homeY;
        const dist = Math.hypot(dx, dy);
        let targetX = dot.homeX;
        let targetY = dot.homeY;
        if (dist < ATTRACT_RADIUS && dist > 0) {
          const pull = (1 - dist / ATTRACT_RADIUS) * ATTRACT_STRENGTH;
          targetX = dot.homeX + dx * pull;
          targetY = dot.homeY + dy * pull;
        }
        dot.x += (targetX - dot.x) * EASE;
        dot.y += (targetY - dot.y) * EASE;
        if (
          Math.abs(targetX - dot.x) > 0.05 ||
          Math.abs(targetY - dot.y) > 0.05
        ) {
          settled = false;
        }
      }
      draw();
      if (settled && mouse.x < -1e3) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      wake();
    };

    const onPointerLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
      wake();
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
