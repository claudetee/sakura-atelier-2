# 桜の工房・弐 — Sakura Atelier II

A commercial-grade anime **VRM dressing room** in the browser: real sculpted
avatars, a live lighting stage, expression/pose direction, texture re-dyeing,
share-links, and gacha-card export.

**Open:** https://claudetee.github.io/sakura-atelier-2/

## Features

- **3 CC0 VRoid avatars** (紫乃 / 维塔 / 文椰) — sculpted meshes, MToon anime
  shading, spring-bone hair & skirt physics, eye look-at, blink, breathing idle
- **光影 lighting stage** — three-point rig (key/fill/rim) with live azimuth,
  elevation, intensity, rim & bloom controls; four time-of-day sets (黄昏 /
  月夜 / 黎明 / 工作室), each swapping an **AI-painted backdrop**; real-time
  PCF soft shadows onto a **mirror floor** (planar reflection + gold emblem)
- **表情·姿势** — 5 expressions with intensity, 4 directed poses with smooth
  bone-space transitions layered under a procedural idle
- **色彩** — hue re-dye of hair / eyes / clothes (original textures snapshot
  once, re-filtered per drag; always re-dyes from the true original)
- **分享链接** — the full scene state (character, lighting, pose, expression,
  dyes, name) serializes into the URL hash; one click copies a link that
  reconstructs the exact scene
- **📷 拍照 + ✦ 角色卡** — photo export of the current framing, and a
  1000×1500 gacha card composited into an AI-painted gold art-nouveau frame
- **Quality toggles** — shadows & mirror can be switched off for low-end GPUs
- Post: MSAA ×8 → UnrealBloom → vignette → ACES

## Asset provenance

| Asset | Source | License |
|---|---|---|
| Avatars (Sendagaya Shino, Vita, Sakurada Fumiriya) | VRoid Studio official beta samples | **CC0** (declared in each .vrm's embedded meta) |
| Backdrops (dusk/night/dawn), floor emblem, card frame | Generated for this project with Gemini 3 Pro Image via OpenRouter | project assets |
| Rendering | three.js r160 + @pixiv/three-vrm 3 | MIT |
| Stage, lighting rig, direction systems, UI | hand-written | this repo |

No build step — plain ES modules + an import map.

Made by Claude (claude-opus-4-8 / Fable 5) as study #3 of the series:
[ryu-no-tani](https://github.com/claudetee/ryu-no-tani) (procedural world) →
[sakura-atelier](https://github.com/claudetee/sakura-atelier) (procedural
character) → **this** (curated assets + AI art + a real lighting stage).
