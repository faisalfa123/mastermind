---
name: artcraft-motion
description: "Use when creating 2D animations (AniCraft), motion graphics and VFX composites (EffectCraft), or multitrack audio mixing (SoundCraft) via ArtCraft MCP servers."
---

# ArtCraft Motion & Media Guide (Animation, VFX, Audio)

This skill covers the three media production applications in the ArtCraft suite:

1. **AniCraft** (`artcraft-anicraft`): 2D animation studio (keyframing, shape tweens, sprites).
2. **EffectCraft** (`artcraft-effectcraft`): Motion graphics and visual effects compositing (After Effects-class).
3. **SoundCraft** (`artcraft-soundcraft`): Multitrack Digital Audio Workstation (DAW) for recording, mixing, and mastering.

---

## 🎬 1. AniCraft (`artcraft-anicraft`)

### Key Tools:
- `anicraft_commands({ "filter": "tween" })`: Discover animation commands.
- `anicraft_document()`: Read current scene, layer list, and timeline frames (0-based).
- `anicraft_run({ "id": "layer.add", "params": { "name": "Character" } })`: Manipulate animation layers.
- `anicraft_render({ "frame": 12, "out": "frame_12.png" })`: Render specific frame to PNG.
- `anicraft_run_script({ "script": "path/to/animation_sequence.json" })`: Run scripted batch animations.

---

## 💥 2. EffectCraft (`artcraft-effectcraft`)

### Key Tools:
- `get_project()` / `get_comp({ "id": "Comp_1" })`: Inspect composition, layers, and properties.
- `add_keyframe({ "comp": "Comp_1", "layer": "Text", "property": "Transform/Opacity", "time": 1.0, "value": 100 })`: Animate properties.
- `add_effect({ "comp": "Comp_1", "layer": "Background", "effect": "FastBlur", "params": { "radius": 15 } })`: Apply visual effects.
- `render_frame({ "comp": "Comp_1", "time": 2.5, "out": "preview.png" })`: Preview rendered composite frame.
- `execute_command({ "id": "render.start", "params": { "out": "vfx_final.mp4", "format": "h264" } })`: Export composition.

---

## 🎧 3. SoundCraft (`artcraft-soundcraft`)

### Key Tools:
- `inspect_session()`: Inspect multitrack audio session, tracks, clips, and bus routing.
- `import_audio({ "track": "Track 1", "path": "voiceover.wav", "offsetSeconds": 0.0 })`: Import audio stems.
- `execute({ "command": "track.volume", "params": { "track": "Music", "db": -6.0 } })`: Adjust mix levels and panning.
- `bounce_mix({ "format": "wav", "sampleRate": 48000, "bitDepth": 24, "out": "final_mix.wav" })`: Bounce master mix.
