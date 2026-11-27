# Banana Arc — Gorilla Projectile Physics

A 1–4 player browser tribute to 1991's QBasic **Gorillas** (`GORILLA.BAS`), built for families and kids to play on a TV + tablet/phone while exploring projectile physics, gravity, wind, and elastic bank shots.

**Play live:** https://mlenarz1983.github.io/banana-arc/

## Features
- **Jackbox-Style TV Host + Tablet/Phone Controller Mode:** Cast the skyline to your TV in **TV Host Mode** (generates a 4-letter Room Code + scannable QR code over WebRTC) and pass a tablet or phone around with a dedicated big-button touchscreen controller—no backend server required.
- **Touch-First Ergonomics:** Custom pointer-driven touch sliders + `-5` / `-1` / `+1` / `+5` stepper buttons with Chrome long-press context menu suppression, plus angles down to **`-30°`** for downward throws from tall towers.
- **15 Iconic Destructible Locations:** Random World Tour (or pick any location!) across 12 iconic world cities (**New York City, Chicago, San Francisco, Seattle, Atlanta, St. Louis's hollow Gateway Arch, Paris, London, Tokyo, Sydney, Cairo & Giza, Rio de Janeiro**) and 3 wild terrains (**DK Jungle Canopy, Volcano Caldera, Alpine Peaks**).
- **8 Playable Gorilla Characters:** King Kong, Astro-Ape, Prof. Peel, Capt. Bongo, DJ Kong, Chef Nana, Ninja Chimp, and Robo-Kong (purely cosmetic for fair family play).
- **Floating DK Bouncy Tires:** Mid-air elastic collisions ($\theta_i = \theta_r$) with `+20 Bank Shot` bonuses and *BOING!* SFX.
- **Verified Solvable Levels & Zero False Self-Blasts:** Unified kinematic stepper with owner-clearance arming guarantees every round is solvable and every shown Solution hits cleanly.
- **Multi-Try Turns & Physics Lab:** Default 3 tries per turn (1 / 3 / 4), downhill-only rooftop walking (`A`/`D` or Step buttons), Earth/Moon/Mars/Jupiter gravity presets, ghost trails, Aim Hint, live Show Solution toggle, and Modern ↔ Retro '90s live theme switching.

## Local Development
```bash
npm install
npm run dev    # Start local dev server
npm test       # Run physics, tire bounce, and 15-location solvability tests
npm run build  # Type-check and build production assets to dist/
```
