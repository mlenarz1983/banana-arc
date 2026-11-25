# Banana Arc — Gorilla Physics

A browser-based tribute to 1991's QBasic **Gorillas** (`GORILLA.BAS`), built for 1–4 players to have fun while learning projectile physics.

## Features
- **1–4 Players** on one shared destructible skyline (solo mode includes **Robo-Kong**, an adjustable-skill physics bot).
- **Dual Visual Themes**: Switch live between **Modern Sunset** and **Retro '90s DOS** themes anytime—preserving buildings, craters, and trails.
- **Real Projectile Physics**: True parabolic motion with Earth, Moon, Mars, and Jupiter gravity presets plus dynamic wind acceleration.
- **Learning Tools**: Previous-shot ghost trail, live launch vector with toggleable `Vx`/`Vy` components, optional Aim Hint for younger kids, and a Physics Lab HUD with flight time, apex, range, and tips.
- **Synthesized Sound Effects**: Pure Web Audio API retro SFX with no external audio files.
- **Silly End-of-Game Awards**: Sun Bonker, Sky-High Lobber, Demolition Crew, and First-Try Sniper.

## Development
```bash
npm install
npm run dev      # Start local dev server
npm test         # Run physics & engine unit tests
npm run build    # Type-check and build for production
```
