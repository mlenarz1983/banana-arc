# Banana Arc — Gorilla Projectile Physics

A 1–4 player browser tribute to 1991's QBasic **Gorillas** (`GORILLA.BAS`), designed for phones, tablets, laptops, and living-room TVs while exploring projectile motion, gravity, wind, and specular reflection.

**Play live:** https://mlenarz1983.github.io/banana-arc/

## Features
- **Responsive Phone, Tablet, Desktop & TV Layout:** Viewport-locked `100dvh` workspace with ~75% unobstructed sky, high-DPI canvas scaling, crisp inline SVG icons, Portrait split (map top / focused controls below), Landscape split (75% map left / collapsible 25% control panel right), and a single `⚙` Options drawer.
- **TV & Remote Mode:** Display the full-screen skyline on a TV or cast laptop (4-letter Room Code + scannable QR code over WebRTC) and pass a phone or tablet around as a dedicated touchscreen remote—no backend server required.
- **Focused 3-Tab Controls (`Throw` · `Move` · `Mirror`):** Drag directly on the sky to aim or position mirrors, fine-tune Angle (`-30°..89°`) & Speed (`8..95 m/s`) with zero-context-menu custom touch sliders + `−`/`+` nudge buttons, walk downhill along rooftops, or place & tilt shared angled **Mirror Panels** ($\theta_i = \theta_r$, up to 4 per round).
- **15 Iconic Low-Profile Skylines:** Chicago, Atlanta, New York City, San Francisco, Seattle, St. Louis (with a hollow Gateway Arch), Paris, London, Tokyo, Sydney, Cairo & Giza, Rio de Janeiro, plus Jungle Canopy, Volcano Caldera, and Alpine Peaks—all scaled into the bottom ~25% of the stage for open sky play.
- **8 Illustrated Gorilla Characters:** Pick your gorilla inside each player's collapsible Setup accordion card (King Kong, Astro-Ape, Prof. Peel, Capt. Bongo, DJ Kong, Chef Nana, Ninja Chimp, and Robo-Kong).
- **Installable Progressive Web App (Android WebAPK):** Opens edge-to-edge in standalone mode with adaptive/maskable app icons and a lightweight network-first service worker for automatic updates on phones and tablets.
- **Verified Solvable Levels & Zero False Self-Blasts:** Unified kinematic stepper verifies every round is solvable before play starts, with an optional Show Solution toggle, Aim Hint arc, visual `Vx`/`Vy` vector arrows, Earth/Moon/Mars/Jupiter gravity presets, multi-try turns (default 3), and Modern ↔ Retro '90s live theme switching.

## Local Development
```bash
npm install
npm run dev    # Start local dev server
npm test       # Run physics, mirror reflection, and 15-location solvability tests
npm run build  # Type-check and build production assets to dist/
```
