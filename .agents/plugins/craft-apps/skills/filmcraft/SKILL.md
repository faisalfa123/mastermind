---
name: filmcraft
description: "Use when editing videos, cutting and trimming clips, managing timeline tracks, adding transitions, or exporting video projects using FilmCraft via MCP."
---

# FilmCraft MCP Guide

FilmCraft is a professional Non-Linear Video Editor (NLE) comparable to Adobe Premiere Pro. It operates via the `craft-filmcraft` MCP server.

## 🎬 Core Concepts

- **Time Resolution**: Time is measured in ticks ($254,016,000,000\text{ ticks per second}$) or directly via `seconds`, `frame`, or standard `timecode` ("00:01:23:15").
- **Timeline Structure**: Project ➔ Sequences ➔ Video/Audio Tracks ➔ Clips & Transitions.
- **Commands**: Every action is an engine command executable through `command_run` or in bulk via `command_batch`.

## 🚀 Common Workflow

### 1. Project & Sequence Discovery
```json
// Inspect project and sequence trees
doc_inspect()
// or
project_inspect()
sequence_inspect()
```

### 2. Import Media Assets
Import video clips, audio tracks, or still images into project bins:
```json
command_run({
  "id": "project.importMedia",
  "params": {
    "files": ["D:\\footage\\intro.mp4", "D:\\music\\background.wav"]
  }
})
```

### 3. Timeline Editing (Cut, Trim, Move)
Place clips on timeline tracks and perform edits:
```json
// Append clip to track V1
command_run({
  "id": "timeline.insertClip",
  "params": {
    "track": "V1",
    "mediaId": "media_intro",
    "startSeconds": 0.0,
    "durationSeconds": 5.0
  }
})

// Razor / Split clip
command_run({
  "id": "timeline.razor",
  "params": {
    "track": "V1",
    "seconds": 2.5
  }
})
```

### 4. Preview and Verification
Render a preview frame from the sequence monitor to verify edit points:
```json
render_preview({
  "seconds": 2.5,
  "scale": 0.5
})
```

### 5. Sequence Export
Export the active sequence to H.264, HEVC, ProRes, etc.:
```json
command_run({
  "id": "file.exportMedia",
  "params": {
    "format": "h264",
    "preset": "YouTube 1080p",
    "out": "output_final.mp4"
  }
})
```
