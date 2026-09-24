# Pixel Asset Contract V1

Pixel Visual V1 is a presentation-only layer for Hero Growth. It does not add domain state and it does not replace the Workbench typography, forms, tables, navigation, or general component system.

Drop user-owned transparent PNG assets at these stable public paths. Missing files render a same-size neutral outline fallback; they never render a broken-image placeholder.

| Slot | Public path | Logical size | Preferred source |
| --- | --- | ---: | ---: |
| Hero avatar | `/pixel/growth/hero-avatar@4x.png` | 64×64 | 256×256 |
| Hero half body | `/pixel/growth/hero-half-body@4x.png` | 96×96 | 384×384 |
| Level badge | `/pixel/growth/level-badge@4x.png` | 32×32 | 128×128 |
| XP frame/fill | `/pixel/growth/xp-frame@4x.png` | 160×16 | 640×64 |
| Career | `/pixel/growth/dimension-career@4x.png` | 24×24 | 96×96 |
| Learning | `/pixel/growth/dimension-learning@4x.png` | 24×24 | 96×96 |
| Creative | `/pixel/growth/dimension-creative@4x.png` | 24×24 | 96×96 |
| Life | `/pixel/growth/dimension-life@4x.png` | 24×24 | 96×96 |
| Body | `/pixel/growth/dimension-body@4x.png` | 24×24 | 96×96 |
| Social | `/pixel/growth/dimension-social@4x.png` | 24×24 | 96×96 |

Assets use `image-rendering: pixelated` and render only at integer logical sizes. Do not add blur, smoothed scaling, emoji substitutes, or generated placeholder art.
