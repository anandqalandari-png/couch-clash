# Couch Clash

Party games on one screen. The laptop shows the game, every phone is a controller. No app install: phones open a web page and type a 4-letter room code (or scan the QR).

| Game | Players | What it is |
|---|---|---|
| **Turbo Clash** | 1–5 racers (CPU cars fill the grid to 4) | Split-screen 3D racing. Tilt the phone to steer. 4 tracks, 5 cars, 5 superpowers, plus item boxes on the track: Rocket, Mine, Shield, Turbo, Zap and Swap. When you get hit, your part of the screen and your phone say who did it and with what. |
| **Scribble It** | 2–8 | Draw on your phone, everyone shouts guesses. Easy 20 / medium 40 / hard 60. The drawer taps "Someone guessed it" and picks who. |
| **Turf War** | 2–8 | Steer freely in any direction with a thumb joystick. Loop out to claim land, cut a trail to knock someone out. Knocked-out players restart on empty ground and are only eliminated when none is left. |
| **Car Football** | 2–8 | Cars, one giant ball, two goals. Joystick to drive, BOOST to dash. Teams are reshuffled after every goal, so the score is personal: 1 point for everyone on the scoring team, 1 extra for the scorer. |
| **Punchline** | 3–8 | Everyone answers silly prompts on their phone, two answers go head to head, the room votes. Round 2 puts your friends' names into the prompts for double points; the final is one prompt everybody answers at triple points. The laptop reads prompts and answers aloud (press M to mute), phones can throw emoji reactions at the screen, and the game ends with a Line of the Night award. Stuck? The dice button writes an answer for you at half points. |
| **Blast Zone** | 2–8 | Classic bomb arena: blow up crates, grab pickups, trap your friends. Knocked-out players become ghosts who run along the wall and throw bombs in. First to 3 rounds. |
| **Size Up** | 1–8 | How tall is a giraffe next to a person? The blue picture is at its true size; everyone resizes the red one on their own phone (drag it, pinch, use the slider or the fine − / + buttons, or type a number) and locks in. Five rounds from a pack the host picks: Animals, Everyday stuff, Things that move, Landmarks & space, or Mixed. Score is 100 for a bullseye (within 5%), dropping to 0 at double or half the real size. One second chance per game when a locked guess is far off. |

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
- **Sound**: browsers only play sound after a click on the page, so click the laptop page once (the lobby reminds you).
- **Bots**: the lobby has a Bots setting (0–3), on the laptop and on the host's phone. Bots join every game except Scribble It and Punchline. In racing they drive as named CPU cars; the grid is still topped up to 4 cars.
- Every controller shows a short how-to card the first time it appears. Tap to close it.
- **Racing**: hold the phone sideways like a steering wheel. Right thumb GAS, left thumb BRAKE, and the two buttons above the brake fire your car's power (when it glows yellow) and your item. **Controls** switches between tilt and arrow buttons, and flips the tilt direction if steering feels reversed.
- More than 5 players: five race, the rest sit out and get priority next race.
- Every game awards session points by finishing order (10, 7, 5, 3, 2, 1…), shown in the lobby.

## Art credits

Cars, trees, rocks, cones, tents, the Blast Zone characters and crates, and the sound effects are free CC0 assets by Kenney (kenney.nl): Car Kit, Nature Kit, Mini Characters, Starter Kit Racing and Starter Kit 3D Platformer. The pictures in Size Up are from Twemoji (© Twitter, Inc. and other contributors, CC-BY 4.0), turned into silhouettes for the guessing phase. See `public/assets/CREDITS.txt`. Terrain, roads, skies and effects are generated in code. If a model file is missing the game falls back to simpler built-in shapes.

## Graphics quality

The 3D games (racing, Car Football, Blast Zone) start at full quality and step down by themselves if the laptop can't hold a smooth frame rate: first the glow effect goes, then resolution, then shadows. To lock the level, open the laptop page with `?q=high` or `?q=low` at the end of the address. If a game still feels choppy, `?q=low` is the first thing to try, along with closing other tabs and plugging the laptop in.

## Things you can tune

- `public/js/race.js`: `CARS` (speed, acceleration, handling, cooldown), `TRACKS` (control points, width, laps, grip, boost pads), `POINTS`. The look of the tracks and cars lives in `public/js/race-world.js`.
- `public/js/sketch.js`: `WORDS`, `DRAW_TIME`, `DRAWER_SHARE` (the drawer earns half the word's points when someone gets it; set to 0 to turn that off).
- `public/js/punch.js`: `PROMPTS`, `PERSONAL` (use `{name}` and `{name2}` where a friend's name should go), `FINALS` and `QUIPS` (the ready-made dice answers). Add your own inside jokes. Also `WRITE_TIME`, `VOTE_TIME`.
- `public/js/size.js`: `THINGS` (name, real size in metres) and `LIST` (which thing is compared with which, and its pack), `ROUNDS`, `GUESS_TIME`. New pictures go in `public/assets/sizeup/`.
- `public/js/host.js`: `MAX_BOTS` and `BOT_NAMES`.
- `public/js/football.js`: `MATCH_TIME`, pitch size (`FL`, `FW`), `TOP` speed, `BOOST_CD`.
- `public/js/blast.js`: `WIN_ROUNDS`, `FUSE`, `SUDDEN` (seconds before the arena closes in).
- `public/js/turf.js`: `GAME_TIME`, `SPEED`, `TURN` (how sharply players can turn), `STEAL_ON_KNOCKOUT`. The map grows with the number of players (the `W` line near the top) (true: the attacker takes the victim's land; false: it becomes empty ground).

## How it works

`server.js` is a small relay: it creates rooms and passes messages between the laptop and the phones over WebSockets. All game logic, bots and rendering run in the laptop's browser (`public/js/host.js` plus one file per game, and `public/js/fx.js` for the shared glow and quality control); phones run `public/js/controller.js`. Three.js is served from `node_modules`, so there is no build step.
