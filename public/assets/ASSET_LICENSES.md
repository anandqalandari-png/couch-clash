# Asset licences

Every third-party file the game ships, where it came from, and what its licence asks for.
All files are stored in this repository under `public/assets/` and are served by the game's own server.
Nothing is loaded from another site while the game runs.

Where a file was fetched from a GitHub mirror, that is stated: the sandbox this work was done in could
reach GitHub but not the creators' own download pages. The mirrors carry the creators' files unchanged.

## Added for the racing graphics upgrade

| Files in `public/assets/` | Asset | Creator | Licence | Attribution required? | Fetched from | Creator's page |
|---|---|---|---|---|---|---|
| `nature2/NormalTree_5.glb`, `PineTree_1.glb`, `PineTree_5.glb`, `PalmTree_1.glb`, `PalmTree_2.glb`, `Bush.glb`, `Bush_Flowers.glb`, `Flower_2_Clump.glb`, `Plant_Flowers.glb`, `Rock_1.glb`, `Rock_2.glb`, `Rock_5.glb`; `nature2/tex/*.png`, `*.jpg` | Ultimate Stylized Nature Pack | Quaternius | CC0 1.0 | No (credited anyway) | `github.com/walterpalladino/godot-quaternius-ultimate-stylized-nature`, folder `ultimate-stylized-nature/sources/` (FBX models and textures) | https://quaternius.com/packs/ultimatestylizednature.html |
| `town/House_1.glb`, `House_2.glb`, `Inn.glb`, `Bell_Tower.glb`, `Well.glb` | Medieval Village Pack | Quaternius | CC0 1.0 | No (credited anyway) | `github.com/trebeljahr/quaternius-showcase`, folder `public/glb/medieval_village_pack/` | https://quaternius.com (pack list) |
| `town/Townhouse.glb` (original name `Building2_Small.glb`) | Buildings Pack | Quaternius | CC0 1.0 | No (credited anyway) | `github.com/trebeljahr/quaternius-showcase`, folder `public/glb/buildings_pack_2/` | https://quaternius.com/packs/buildings.html |
| `racekit/grandStandAwning.glb`, `tent.glb`, `lightPostLarge.glb`, `bannerTowerRed.glb`, `flagCheckers.glb` | Racing Kit 2.0 | Kenney | CC0 1.0 | No (credited anyway) | `github.com/ETdoFresh/kenney.nl`, folder `kenney_racingkit2/Models/GLTF format/` | https://kenney.nl/assets/racing-kit |
| `env/rooitou_park_1k.hdr` | Rooitou Park (HDRI, 1k) | Greg Zaal, Poly Haven | CC0 1.0 | No (credited anyway) | `github.com/pmndrs/drei-assets`, folder `hdri/` | https://polyhaven.com/a/rooitou_park |
| `env/kiara_1_dawn_1k.hdr` | Kiara 1 Dawn (HDRI, 1k) | Greg Zaal, Poly Haven | CC0 1.0 | No (credited anyway) | `github.com/pmndrs/drei-assets`, folder `hdri/` | https://polyhaven.com/a/kiara_1_dawn |

Licence checks: the CC0 statement was read on the creator's own page for the Ultimate Stylized Nature Pack, the
Buildings Pack and both HDRIs, and in the `_License.txt` that ships inside the Racing Kit. For the Medieval Village
Pack the pack's own page could not be opened from here; Quaternius publishes all of his packs under CC0.

### How these files were changed

- Quaternius nature models were converted from FBX to GLB (one mesh per material, Y up, base on the ground). No shapes were edited.
- `NormalTree_Leaves.png`, `Bush_Leaves.png` and `PineTree_Leaves.png` were repainted: the flat lime leaves now have
  per-leaf tones, a base-to-tip gradient and a midrib; pine needles were shifted to a deep blue-green. A 6-pixel
  bark-coloured square was added in the top-left corner (and at x = 128 in `PalmTree_Leaves.png`) so a whole tree
  can be drawn in one draw call.
- Buildings and Kenney racing-kit pieces are recoloured when the game loads them (cream plaster, terracotta roofs,
  red and cream trackside furniture); the files themselves are untouched.
- In the game, `NormalTree_5` is drawn with about 60% of its leaf cards to save triangles.

### Made in code (no third-party file)

Racing car bodies, wheels and paintwork; terrain, road, kerbs, limestone walls and bridge; cypress trees; mountains;
sky, clouds and water; far-away stand-ins for trees and houses; all effects and the race HUD.

## Already in the game before this upgrade

| Files in `public/assets/` | Asset | Creator | Licence | Attribution required? |
|---|---|---|---|---|
| `cars/*.glb`, `props/cone.glb` | Car Kit | Kenney (kenney.nl) | CC0 1.0 | No (credited anyway) |
| `props/tree_*`, `cactus_*`, `rock_*`, `stone_*`, `plant_*`, `tent_*`, `canoe`, `statue_*` | Nature Kit | Kenney | CC0 1.0 | No |
| `props/decoration-tents.glb`, `sfx/impact.ogg`, `sfx/skid.ogg` | Starter Kit Racing | Kenney | CC0 1.0 | No |
| `chars/*.glb` | Mini Characters | Kenney | CC0 1.0 | No |
| `blocks/brick.glb`, `sfx/break.ogg`, `coin.ogg`, `jump.ogg`, `land.ogg`, `fall.ogg` | Starter Kit 3D Platformer | Kenney | CC0 1.0 | No |
| `sizeup/*.png` | Twemoji | Twitter, Inc. and other contributors (https://github.com/jdecked/twemoji) | CC-BY 4.0 | **Yes.** Keep this credit. Changes made: converted from SVG to PNG, cropped, a few rotated, also shown as single-colour silhouettes. |

Code libraries (installed by `npm install`, not stored in the repository): three.js (MIT), express (MIT), ws (MIT), qrcode (MIT).
