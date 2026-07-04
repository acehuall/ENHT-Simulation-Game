
# Split notes

The original HTML file contained four things in one place:

1. HTML structure
2. CSS styling
3. Game/map data
4. Canvas rendering and simulation logic

The split keeps the behaviour the same but separates responsibilities.

## Data files

- `map-data.js` contains the tilemap, floor colours, wall colours, props and labels.
- `agents-data.js` contains the characters, roles and routes.
- `scenario-data.js` contains the current quarter timeline, toasts and metric changes.

## Engine files

- `canvas.js` prepares shared canvas helpers and utility functions.
- `map-renderer.js` draws the static hospital map layer.
- `prop-renderer.js` draws beds, desks, MRI machine, cabinets, etc.
- `pathing.js` handles deterministic waypoint movement.
- `agent-renderer.js` draws the pixel characters.
- `state.js` stores current runtime state: paused, clock and last frame time.
- `simulation.js` contains the render loop and quarter animation.

## UI files

- `labels.js` places room labels over the map.
- `legend.js` builds the map legend section.
- `controls.js` wires pause, restart, fullscreen, labels and scanline toggles.
- `telemetry.js` draws the EKG-style ward telemetry graph.

## Recommended next step

The current split preserves the prototype. The next improvement would be to turn `scenario-data.js` into a clearer four-quarter scenario structure, where each decision option owns its metric effects, toasts and visual incidents.
