# Banana Arc — Gorilla Projectile Physics

A 1–4 player browser tribute to 1991's QBasic **Gorillas** (`GORILLA.BAS`), built for families and kids to have fun while learning projectile physics, gravity, and wind.

**Play live:** https://mlenarz1983.github.io/banana-arc/

## Features
- **Verified Solvable Skylines:** Every round is checked with an exact ballistic solver before starting so no level is ever impossible.
- **1–4 Players on One Destructible Skyline:** Pass-and-play with 2–4 gorillas, or play solo against **Robo-Kong** (Easy / Normal / Clever).
- **Downhill-Only Rooftop Movement:** Walk left/right (`A`/`D` or Step buttons) across roofs and drop down onto lower buildings—no climbing taller walls.
- **Multi-Try Turns:** Default **3 tries per turn** (configurable to 1, 3, or 4) with a live **Ghost Trail** of your previous shot so kids can iterate and learn from misses.
- **Dual Visual Themes:** Switch live between **Modern Sunset** and **Retro '90s DOS** anytime while preserving buildings, craters, and trails.
- **Projectile Physics Lab:** Earth (`9.8 m/s²`), Moon (`1.62 m/s²`), Mars (`3.71 m/s²`), and Jupiter (`24.8 m/s²`) gravity presets, wind acceleration, live `Vx`/`Vy` vector decomposition, optional **Aim Hint**, and a toggleable **Show Solution** verifier.
- **Zero External Assets:** Pure HTML5 Canvas + TypeScript + synthesized Web Audio API sound effects.

## Local Development
```bash
npm install
npm run dev          # Start local dev server
npm test             # Run physics, solvability, and movement unit tests
npm run build        # Type-check and build production assets to dist/
npm run build:single # Build a single self-contained dist/index.html
```
