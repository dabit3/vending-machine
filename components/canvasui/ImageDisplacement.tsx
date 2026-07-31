"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Displacement for a static image background. The stock canvasui
// Displacement captures live HTML through the experimental html-in-canvas
// API (drawElementImage/requestPaint), which no stable browser ships — so it
// silently fell back to undisplaced HTML here. This variant uploads a photo
// directly as a WebGL texture instead, so the same cell-shear simulation
// runs in any browser with WebGL2. Children render as normal DOM above the
// canvas and stay crisp while the photo shears beneath them.

export interface ImageDisplacementOptions {
  /** Cells across the width of the wrapped area (4 to 100). */
  grid?: number;
  /** Width to height ratio of each cell (0.25 to 4). 1 is a perfect square. */
  cellAspect?: number;
  /** Radius of the cursor influence as a fraction of the grid (0.02 to 1). */
  radius?: number;
  /** How hard cursor movement pushes cells around (0 to 1). */
  strength?: number;
  /** Minimum cursor speed in CSS pixels per second before cells react. 0 reacts to any movement. */
  threshold?: number;
  /** How slowly cells return to rest, per frame (0.5 to 0.99). */
  relaxation?: number;
  /** Multiplier on how far displaced cells shift the content (0 to 4). */
  shift?: number;
  /** Chromatic aberration inside each displaced cell (0 to 3). */
  aberration?: number;
  /** Film grain over displaced cells (0 to 1). */
  grain?: number;
  /** Grain speck size multiplier (0.5 to 4). */
  grainSize?: number;
  /** Grain animation speed (0 to 4). */
  grainSpeed?: number;
  /** Random cell scramble on load that relaxes into place (0 to 3). */
  scramble?: number;
}

export interface ImageDisplacementElements {
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
  /** URL of the image drawn cover-fit behind the content. */
  src: string;
}

export interface ImageDisplacementInstance {
  /** Update effect options live. */
  setOptions: (options: ImageDisplacementOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<ImageDisplacementOptions> = {
  grid: 50,
  cellAspect: 1,
  radius: 0.1,
  strength: 0.1,
  threshold: 1000,
  relaxation: 0.9,
  shift: 1,
  aberration: 1.5,
  grain: 0.1,
  grainSize: 1,
  grainSpeed: 1,
  scramble: 1,
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Same displacement/aberration/grain shader as canvasui Displacement, minus
// the transparent-alpha handling (a photo is opaque) and plus uCov, which
// maps canvas UVs onto the image like CSS object-fit: cover.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uField;
uniform vec2 uResolution;
uniform vec2 uCov;
uniform float uShift;
uniform float uAberration;
uniform float uGrain;
uniform float uGrainPx;
uniform float uGrainTick;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 cover(vec2 uv) {
  return clamp((uv - 0.5) * uCov + 0.5, vec2(0.001), vec2(0.999));
}

void main () {
  vec2 cuv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 offset = texture(uField, cuv).rg;
  vec2 push = offset * 0.02 * uShift;
  float ab = uAberration * 0.08;
  vec3 col = vec3(
    texture(uContent, cover(cuv - push * (1.0 + ab))).r,
    texture(uContent, cover(cuv - push)).g,
    texture(uContent, cover(cuv - push * (1.0 - ab))).b
  );
  float pushPx = length(push * uResolution);
  float gate = smoothstep(1.5, 18.0, pushPx);
  vec2 cell = floor(gl_FragCoord.xy / max(uGrainPx, 1.0));
  float gn = hash(cell + vec2(uGrainTick * 0.37, uGrainTick * 0.113));
  col += (gn - 0.5) * 0.3 * uGrain * gate;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export function createImageDisplacement(
  elements: ImageDisplacementElements,
  options: ImageDisplacementOptions = {},
): ImageDisplacementInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { output, src } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error(
        "ImageDisplacement shader error:",
        gl!.getShaderInfoLog(shader),
      );
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fieldTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  let cols = 0;
  let rows = 0;
  let rowScale = 1;
  let outW = 1;
  let outH = 1;
  let scrambled = false;
  let field = new Float32Array(0);
  let fieldDirty = false;

  function syncGrid() {
    const nextCols = Math.round(Math.min(Math.max(config.grid, 4), 100));
    const aspect = Math.min(Math.max(config.cellAspect, 0.25), 4);
    const nextRows = Math.max(
      2,
      Math.min(Math.round((nextCols * outH * aspect) / outW), 200),
    );
    if (nextCols === cols && nextRows === rows) {
      rowScale = (outH * cols) / (outW * rows);
      return;
    }
    cols = nextCols;
    rows = nextRows;
    rowScale = (outH * cols) / (outW * rows);
    field = new Float32Array(cols * rows * 2);
    if (!scrambled && !reducedMotion && config.scramble > 0) {
      const amp = 40 * Math.min(config.scramble, 3);
      for (let i = 0; i < field.length; i++) {
        field[i] = (Math.random() * 2 - 1) * amp;
      }
    }
    scrambled = true;
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
    gl!.pixelStorei(gl!.UNPACK_ALIGNMENT, 1);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RG32F,
      cols,
      rows,
      0,
      gl!.RG,
      gl!.FLOAT,
      field,
    );
    fieldDirty = false;
  }

  let dpr = 1;

  function syncCanvasSize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    outW = Math.max(1, output.clientWidth);
    outH = Math.max(1, output.clientHeight);
    const width = Math.max(1, Math.round(outW * dpr));
    const height = Math.max(1, Math.round(outH * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    syncGrid();
  }

  syncCanvasSize();

  // The photo is uploaded once; until it arrives the canvas is never drawn,
  // so it stays transparent and the DOM <img> behind it shows through.
  let imageReady = false;
  let imgW = 0;
  let imgH = 0;
  const img = document.createElement("img");
  img.decoding = "async";
  img.onload = () => {
    if (destroyed) return;
    imgW = img.naturalWidth;
    imgH = img.naturalHeight;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img);
    gl!.generateMipmap(gl!.TEXTURE_2D);
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_MIN_FILTER,
      gl!.LINEAR_MIPMAP_LINEAR,
    );
    imageReady = true;
    start();
  };
  img.src = src;

  function uploadField() {
    if (!fieldDirty) return;
    fieldDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
    gl!.pixelStorei(gl!.UNPACK_ALIGNMENT, 1);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      0,
      0,
      cols,
      rows,
      gl!.RG,
      gl!.FLOAT,
      field,
    );
  }

  const mouse = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vX: 0,
    vY: 0,
    speed: 0,
    gate: 0,
    lastT: 0,
  };
  let tracking = false;

  function stepSimulation(delta: number): boolean {
    const relaxation = Math.min(Math.max(config.relaxation, 0.5), 0.995);
    const decay = Math.pow(relaxation, delta * 60);
    let maxAbs = 0;
    for (let i = 0; i < field.length; i++) {
      const value = field[i] * decay;
      field[i] = value;
      const abs = Math.abs(value);
      if (abs > maxAbs) maxAbs = abs;
    }
    const injecting = tracking && (mouse.vX !== 0 || mouse.vY !== 0);
    if (injecting) {
      const gridX = mouse.x * cols;
      const gridY = mouse.y * rows;
      const maxDist = cols * Math.min(Math.max(config.radius, 0.02), 1);
      const maxSq = maxDist * maxDist;
      const gain = Math.min(Math.max(config.strength, 0), 1) * 100 * mouse.gate;
      for (let j = 0; j < rows; j++) {
        const dy = (gridY - j) * rowScale;
        for (let i = 0; i < cols; i++) {
          const dx = gridX - i;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxSq) {
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            const idx = 2 * (i + cols * j);
            field[idx] += gain * mouse.vX * power;
            field[idx + 1] += gain * mouse.vY * power;
          }
        }
      }
    }
    const vDecay = Math.pow(0.9, delta * 60);
    mouse.vX *= vDecay;
    mouse.vY *= vDecay;
    if (Math.abs(mouse.vX) < 0.0001) mouse.vX = 0;
    if (Math.abs(mouse.vY) < 0.0001) mouse.vY = 0;
    fieldDirty = true;
    const alive =
      injecting || mouse.vX !== 0 || mouse.vY !== 0 || maxAbs > 0.03;
    if (!alive && maxAbs > 0) field.fill(0);
    return alive;
  }

  let time = 0;

  function render() {
    if (!imageReady) return;
    uploadField();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
    gl!.uniform1i(uniforms.uField, 1);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    // object-fit: cover from the center — scale the shorter-relative axis so
    // the image fills the canvas and the excess is cropped evenly.
    const ratio = outW / outH / (imgW / imgH);
    gl!.uniform2f(
      uniforms.uCov,
      ratio >= 1 ? 1 : ratio,
      ratio >= 1 ? 1 / ratio : 1,
    );
    gl!.uniform1f(uniforms.uShift, Math.min(Math.max(config.shift, 0), 4));
    gl!.uniform1f(
      uniforms.uAberration,
      Math.min(Math.max(config.aberration, 0), 3),
    );
    gl!.uniform1f(uniforms.uGrain, Math.min(Math.max(config.grain, 0), 1));
    gl!.uniform1f(
      uniforms.uGrainPx,
      Math.max(1, Math.min(Math.max(config.grainSize, 0.5), 4) * dpr * 1.5),
    );
    gl!.uniform1f(
      uniforms.uGrainTick,
      Math.floor(time * Math.min(Math.max(config.grainSpeed, 0), 4) * 18),
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    time += delta;
    let alive = false;
    if (!reducedMotion) alive = stepSimulation(delta);
    render();
    if (!alive) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible || !imageReady) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      field.fill(0);
      mouse.vX = 0;
      mouse.vY = 0;
      fieldDirty = true;
    }
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const pointerHost = output.parentElement ?? output;

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return;
    const box = output.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const now = performance.now();
    if (!tracking) {
      tracking = true;
      mouse.prevX = x;
      mouse.prevY = y;
      mouse.speed = 0;
      mouse.gate = 0;
      mouse.lastT = now;
    }
    mouse.vX = x - mouse.prevX;
    mouse.vY = y - mouse.prevY;
    const dt = Math.max((now - mouse.lastT) / 1000, 0.001);
    mouse.lastT = now;
    const distPx = Math.hypot(mouse.vX * box.width, mouse.vY * box.height);
    const instSpeed = distPx / dt;
    mouse.speed += (instSpeed - mouse.speed) * Math.min(dt * 25, 1);
    const threshold = Math.max(config.threshold, 0);
    if (threshold <= 0) {
      mouse.gate = 1;
    } else {
      const ramp = (mouse.speed - threshold) / threshold;
      const step = Math.min(Math.max(ramp, 0), 1);
      mouse.gate = step * step * (3 - 2 * step);
    }
    mouse.prevX = x;
    mouse.prevY = y;
    mouse.x = x;
    mouse.y = y;
    start();
  }

  function onPointerLeave() {
    tracking = false;
    mouse.vX = 0;
    mouse.vY = 0;
    mouse.speed = 0;
    mouse.gate = 0;
  }

  pointerHost.addEventListener("pointermove", onPointerMove);
  pointerHost.addEventListener("pointerleave", onPointerLeave);
  pointerHost.addEventListener("pointercancel", onPointerLeave);

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncGrid();
      syncCanvasSize();
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      img.onload = null;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      pointerHost.removeEventListener("pointermove", onPointerMove);
      pointerHost.removeEventListener("pointerleave", onPointerLeave);
      pointerHost.removeEventListener("pointercancel", onPointerLeave);
      // Clear so a swapped-in instance (e.g. on theme change) never sits
      // behind a stale frame of the previous image.
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(fieldTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
    },
  };
}

export interface ImageDisplacementProps extends ImageDisplacementOptions {
  /** URL of the background image the effect displaces. May be undefined
      while the caller resolves it (e.g. waiting on the active theme). */
  src?: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ImageDisplacement({
  src,
  children,
  className,
  style,
  ...options
}: ImageDisplacementProps) {
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<ImageDisplacementInstance | null>(null);
  const [initialOptions] = useState(options);

  useEffect(() => {
    const output = outputRef.current;
    if (!output || !src) return;
    instanceRef.current = createImageDisplacement(
      { output, src },
      initialOptions,
    );
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [initialOptions, src]);

  useEffect(() => {
    instanceRef.current?.setOptions(options);
  });

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      {/* Static base layer, and the no-WebGL fallback. unoptimized keeps the
          URL identical to the texture fetch so the image downloads once. */}
      {src ? (
        <Image
          src={src}
          alt=""
          aria-hidden
          fill
          priority
          unoptimized
          className="object-cover"
        />
      ) : null}
      <canvas
        ref={outputRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {children}
      </div>
    </div>
  );
}

export default ImageDisplacement;
