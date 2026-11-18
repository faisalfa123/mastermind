---
name: figcraft
description: "Use when creating, editing, inspecting, or exporting UI/UX designs, mobile/web app screens, components, auto-layout frames, and design tokens using FigCraft via MCP."
---

# FigCraft MCP Guide

FigCraft is an interface design tool comparable to Figma, Penpot, and Sketch. It operates via the `craft-figcraft` MCP server.

## 📐 Core Concepts

- **Coordinates**: Page units ($1\text{ unit} = 1\text{ px}$ at 100% zoom). Origin $(0, 0)$ is top-left, $x$ right, $y$ down.
- **Node Hierarchy**: Page ➔ Frames / Groups ➔ Shapes / Text / Components / Instances.
- **Auto-Layout**: Child elements of auto-layout frames are positioned automatically by layout rules (`layout`, `gap`, `padding`, `mainAlign`, `crossAlign`, `sizingH`, `sizingV`).
- **Colors**: Standard hex format `"#RRGGBB"` or `"#RRGGBBAA"`.

## 🚀 Common Workflow

### 1. Inspect Document or Node
Inspect the active document structure to discover page IDs, frames, and layers:
```json
// Inspect whole document
inspect_document()

// Inspect a specific node by ID
get_node({ "id": "frame_123" })
```

### 2. Create and Position UI Elements
Create nodes (frames, rectangles, text) relative to parent:
```json
// Create root frame
run_command({
  "id": "frame.new",
  "params": {
    "name": "Login Screen",
    "x": 100,
    "y": 100,
    "width": 375,
    "height": 812,
    "fill": "#FFFFFF"
  }
})
```

### 3. Configure Auto-Layout
```json
run_command({
  "id": "autolayout.set",
  "params": {
    "direction": "vertical",
    "gap": 16,
    "padding": 24,
    "mainAlign": "start",
    "crossAlign": "stretch"
  }
})
```

### 4. Visual Verification
Capture a screenshot of the frame or page to verify design aesthetics:
```json
screenshot({ "id": "frame_123" })
```

### 5. Export
Export frames or components to SVG, PNG, WebP, or PDF:
```json
export({
  "id": "frame_123",
  "format": "png",
  "scale": 2.0,
  "path": "login_screen@2x.png"
})
```
