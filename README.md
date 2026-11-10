# Couch Clash

Party games on one screen. The laptop shows the game, every phone is a controller. No app install: phones open a web page and type a 4-letter room code (or scan the QR).

| Game | Players | What it is |
|---|---|---|
| **Turbo Clash** | 1–5 racers (CPU cars fill the grid to 4) | Split-screen 3D racing. Tilt the phone to steer. 4 tracks, 5 cars, 5 superpowers, plus item boxes on the track: Rocket, Mine, Shield, Turbo, Zap and Swap. |
| **Scribble It** | 2–8 | Draw on your phone, everyone shouts guesses. Easy 20 / medium 40 / hard 60. The drawer taps "Someone guessed it" and picks who. |
| **Turf War** | 2–8 | Steer freely in any direction with a thumb joystick. Loop out to claim land, cut a trail to knock someone out. Knocked-out players restart on empty ground and are only eliminated when none is left. |
| **Car Football** | 2–8 | Cars, one giant ball, two goals. Joystick to drive, BOOST to dash. Teams are reshuffled after every goal, so the score is personal: 1 point for everyone on the scoring team, 1 extra for the scorer. |
| **Punchline** | 3–8 | Everyone answers silly prompts on their phone, two answers go head to head, the room votes. Ends with one prompt everybody answers. |
| **Blast Zone** | 2–8 | Classic bomb arena: blow up crates, grab pickups, trap your friends. Knocked-out players become ghosts who run along the wall and throw bombs in. First to 3 rounds. |

## Run it on your laptop

```
npm install
npm start
```

Open http://localhost:3000 on the laptop. Phones cannot reach `localhost`, so for a real session either deploy it (below) or have phones on the same Wi-Fi open `http://<laptop-ip>:3000/play`. Tilt steering needs HTTPS on most phones, so on plain `http://` the controller falls back to on-screen steering buttons.

## Put it online (Railway, about 5 minutes)

1. Push this folder to a GitHub repo (`node_modules` is ignored).
2. On railway.com: New Project → Deploy from GitHub repo → pick the repo. Railway detects Node and runs `npm start`.
3. In the service's Settings → Networking → Generate Domain.
4. Open that `https://…up.railway.app` address on the laptop. The lobby shows the join address, code and QR.

Any host that runs a long-lived Node process with WebSockets works the same way (Render, Fly.io). Vercel and Netlify do not: they are serverless and cannot hold the WebSocket connection.

## How to play

- The first phone to join is the **host**: it picks the game, the track, and taps GO / Back to lobby. The laptop also accepts clicks, Enter (continue) and Esc (end the game).
- **Racing**: hold the phone sideways like a steering wheel. Right thumb GAS, left thumb BRAKE, middle button fires your power when it turns yellow. If steering feels reversed tap **Flip**; **Use buttons** swaps tilt for left/right buttons.
- More than 5 players: five race, the rest sit out and get priority next race.
- Every game awards session points by finishing order (10, 7, 5, 3, 2, 1…), shown in the lobby.

## Art credits

Cars, trees, rocks, cones, tents, the Blast Zone characters and crates, and the sound effects are free CC0 assets by Kenney (kenney.nl): Car Kit, Nature Kit, Mini Characters, Starter Kit Racing and Starter Kit 3D Platformer. See `public/assets/CREDITS.txt`. Terrain, roads, skies and effects are generated in code. If a model file is missing the game falls back to simpler built-in shapes.

## Graphics quality

The racing game starts at full quality (real shadows, high resolution) and steps down by itself if the laptop can't hold a smooth frame rate. To lock it, open the laptop page with `?q=high` or `?q=low` at the end of the address.

## Things you can tune

- `public/js/race.js`: `CARS` (speed, acceleration, handling, cooldown), `TRACKS` (control points, width, laps, grip, boost pads), `POINTS`. The look of the tracks and cars lives in `public/js/race-world.js`.
- `public/js/sketch.js`: `WORDS`, `DRAW_TIME`, `DRAWER_SHARE` (the drawer earns half the word's points when someone gets it; set to 0 to turn that off).
- `public/js/punch.js`: `PROMPTS` and `FINALS` (add your own inside jokes), `WRITE_TIME`, `VOTE_TIME`.
- `public/js/football.js`: `MATCH_TIME`, pitch size (`FL`, `FW`), `TOP` speed, `BOOST_CD`.
- `public/js/blast.js`: `WIN_ROUNDS`, `FUSE`, `SUDDEN` (seconds before the arena closes in).
- `public/js/turf.js`: `GAME_TIME`, `SPEED`, `TURN` (how sharply players can turn), `STEAL_ON_KNOCKOUT`. The map grows with the number of players (the `W` line near the top) (true: the attacker takes the victim's land; false: it becomes empty ground).

## How it works

`server.js` is a small relay: it creates rooms and passes messages between the laptop and the phones over WebSockets. All game logic and rendering run in the laptop's browser (`public/js/host.js` plus one file per game); phones run `public/js/controller.js`. Three.js is served from `node_modules`, so there is no build step.
