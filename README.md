# ENHT Simulation Game

**ENHT Simulation Game** is a board-level decision simulation game for NHS work experience students. Players act as the executive board of a fictional NHS trust and make difficult quarterly decisions about finance, safety, waiting times, staff morale, patient satisfaction and reputation.

The game is designed to be run as a group, with each person taking on a different C-Suite role — finance, nursing, operations, safety, governance etc. — to discuss and collaborate on one option.

## Primary Audience

This project is primarily for:

- **NHS work experience students** taking part in a simulation or insight day.
- **Facilitators, finance staff, managers or education teams** running the session.
- **Internal developers or contributors** helping build or maintain the game.
- **Scenario authors** who may want to add or edit decision scenarios without changing the game code.

The game assumes players do not need prior NHS finance, operational or board-level experience. The purpose is to make trade-offs understandable through decisions, visible consequences and group discussion.

## Core Goal

The goal of the game is to help students understand that NHS leadership decisions involve trade-offs.

Each quarter, the group is presented with a crisis affecting the fictional **Northbrook General Hospital NHS Trust**. The group must choose one of four possible responses. Every option has benefits and drawbacks.

The game is built around some core ideas:

1. **Every option should be defensible.**  
   There should not be one obviously correct answer. The learning comes from the discussion.

2. **There should be collaboration.**  
   The goal is not around self-interest, but around collaboration, making sure all voices and concerns are raised.

3. **Content should be data-driven.**  
   Given that most of the things players will be given are data and reports, they need to make sure that their choices take the changing impacts into the discussion.

## How to Run

No installation is required.

1. Download or copy the full project folder.
2. Open `index.html` in a modern browser.
3. Use full-screen mode for presenting:
   - Press `F11` on Windows.
4. The facilitator controls progression through the game.

The pre-game flow introduces the Trust, lets the group assemble its board, then
presents a short, facilitator-paced board briefing. Add `?skipintro` to the
`index.html` URL to bypass this flow while testing or restarting a session. The
in-game **Restart Q** button and `R` confirm before restarting the current
quarter directly; they deliberately do not return to the briefing, so a
facilitator can recover quickly mid-session.

The game is intended to run locally and offline.

## Future Development

Put the project into a Vercel site and host it so it can be easily accessible and avoid download issues.

Site:

## Dependencies

This project has **no runtime dependencies**.

It uses:

- HTML
- CSS
- Vanilla JavaScript
- Canvas API

There is:

- No build step
- No package manager requirement
- No server requirement
- No React, Vue, Angular or other JavaScript framework
- No external CDN dependency

This is intentional. The project should be able to run from a local folder, USB stick or shared drive on a locked-down NHS machine.

## Browser Support

Recommended browsers:

- Microsoft Edge
- Google Chrome

The game is designed for:

- Desktop/laptop use
- Mouse input
- 1920×1080 projector or TV display
- Offline/local running

## Important Technical Note

The game is designed to work when opened directly from `index.html`.

Because browsers can block some features when running from `file://`, the project avoids:

- ES module imports
- `fetch()` for local JSON files
- External web fonts or CDN assets

Instead, scripts are loaded directly in order through standard `<script>` tags, and game data is stored in JavaScript files.

## Facilitator Hotkeys

Suggested hotkeys:

| Key | Action |
|---|---|
| `S` | Skip simulation |
| `P` | Pause simulation |
| `F` | Show facilitator notes |
| `R` | Restart game |

Restart should require confirmation to avoid accidental resets. The facilitator
notes are also reachable from the visible **Notes** button; opening them pauses
the simulation and restores the previous run state on close. While the notes or
board pack are open, the other shortcuts are suppressed.

## Tests

Browser-driven UI tests live in `tests/` (Playwright). They cover skip, restart,
rewind, the fullscreen chrome, and the facilitator-notes modal. The game itself
stays dependency-free; the tests keep their own `package.json`.

```
cd tests
npm install
npm test
```

The Chromium binary is auto-detected; override with `PW_CHROMIUM=/path/to/chrome`.

## Design Principles

When making changes, keep the following principles in mind:

- Keep the game simple to run.
- Keep scenario content easy to edit.
- Avoid unnecessary dependencies.
- Prioritise clear trade-offs over realism.
- The simulation should support the learning, not become the main system.
- The game should work offline.
- The project should be understandable to a future colleague opening the folder for the first time.

## Current Status

This project is currently structured around the MVP build of **ENHT Simulation Game**.

The immediate goal is to create a complete playable version that can run locally from `index.html` and support a full four-quarter workshop session.
