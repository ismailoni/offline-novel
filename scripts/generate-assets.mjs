/**
 * Generates the app icon / splash / favicon PNGs from inline SVG.
 * Run once with:  node scripts/generate-assets.mjs
 * (sharp is a dev-only tool; it is not a runtime dependency of the app.)
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const BG_DARK = '#0f1115';

// The book+bookmark mark, drawn on a transparent canvas so it can be reused
// for the splash and the Android adaptive foreground. `scale` shrinks the mark
// within the 1024 box to leave safe padding (Android crops adaptive icons).
function markSvg(scale = 1) {
  const s = scale;
  const t = (1024 * (1 - s)) / 2; // translate to keep it centered
  return `
  <g transform="translate(${t},${t}) scale(${s})">
    <defs>
      <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9d86ff"/>
        <stop offset="1" stop-color="#6d4dff"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5">
        <stop offset="0" stop-color="#7c5cff" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#7c5cff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="512" cy="500" r="360" fill="url(#glow)"/>
    <!-- left page -->
    <path d="M250 330 Q512 380 512 380 L512 720 Q250 680 250 680 Z"
          fill="url(#page)"/>
    <!-- right page -->
    <path d="M774 330 Q512 380 512 380 L512 720 Q774 680 774 680 Z"
          fill="url(#page)" opacity="0.92"/>
    <!-- spine -->
    <rect x="504" y="378" width="16" height="344" rx="6" fill="#4a35b0"/>
    <!-- page lines -->
    <g stroke="#ffffff" stroke-opacity="0.55" stroke-width="10" stroke-linecap="round">
      <line x1="300" y1="430" x2="470" y2="452"/>
      <line x1="300" y1="480" x2="470" y2="502"/>
      <line x1="300" y1="530" x2="470" y2="552"/>
      <line x1="554" y1="452" x2="724" y2="430"/>
      <line x1="554" y1="502" x2="724" y2="480"/>
      <line x1="554" y1="552" x2="724" y2="530"/>
    </g>
    <!-- bookmark ribbon -->
    <path d="M600 300 L664 300 L664 470 L632 440 L600 470 Z" fill="#c9baff"/>
  </g>`;
}

function iconSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1b2030"/>
        <stop offset="1" stop-color="#0d0f14"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
    ${markSvg(0.86)}
  </svg>`;
}

// Adaptive foreground: mark only, extra padding, transparent background.
function adaptiveSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    ${markSvg(0.62)}
  </svg>`;
}

// Splash mark: transparent; expo-splash-screen paints BG_DARK behind it.
function splashSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    ${markSvg(0.72)}
  </svg>`;
}

async function render(svg, file, size) {
  const buf = Buffer.from(svg);
  await sharp(buf).resize(size, size).png().toFile(join(OUT, file));
  console.log('wrote', file, `${size}x${size}`);
}

await mkdir(OUT, { recursive: true });
await render(iconSvg(), 'icon.png', 1024);
await render(adaptiveSvg(), 'adaptive-icon.png', 1024);
await render(splashSvg(), 'splash-icon.png', 1024);
await render(iconSvg(), 'favicon.png', 48);
console.log('BG_DARK for splash/adaptive background:', BG_DARK);
