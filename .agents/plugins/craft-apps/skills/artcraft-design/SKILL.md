---
name: artcraft-design
description: "Use when creating vector graphics (VectorCraft), editing raster photos/layers (PhotoCraft), or composing multi-page documents and publishing layouts (DesignCraft) via ArtCraft MCP servers."
---

# ArtCraft Visual Design Guide (Photo, Vector, Layout)

This skill covers the three visual design applications in the ArtCraft suite:

1. **PhotoCraft** (`artcraft-photocraft`): Photoshop-class raster image editor.
2. **VectorCraft** (`artcraft-vectorcraft`): Illustrator-class vector graphics & path editor.
3. **DesignCraft** (`artcraft-designcraft`): InDesign-class publishing & multi-page document layout editor.

---

## 🎨 1. PhotoCraft (`artcraft-photocraft`)

### Key Tools:
- `doc_new({ "width": 1920, "height": 1080, "colorMode": "rgb" })`: Create new canvas.
- `doc_open({ "path": "image.psd" })`: Open PSD or .pcraft file.
- `command_run({ "id": "layer.new", "params": { "name": "Overlay" } })`: Manipulate layers.
- `doc_inspect()`: Inspect layer tree, blend modes, and dimensions.
- `render_preview()`: Generate PNG preview of current canvas.
- `doc_save({ "path": "artwork.pcraft" })`: Save native or export to PNG/JPG.

---

## ✒️ 2. VectorCraft (`artcraft-vectorcraft`)

### Key Tools:
- `inspect_document()`: Inspect artboards, paths, swatches, and shapes.
- `draw_shape({ "type": "rect", "x": 50, "y": 50, "width": 200, "height": 100 })`: Add vector shape.
- `draw_path({ "points": [[0,0], [100,50], [200,0]] })`: Create bezier paths.
- `set_paint({ "fill": "#336699", "stroke": "#000000", "strokeWidth": 2 })`: Set colors and stroke.
- `pathfinder({ "operation": "unite" })`: Boolean path operations.
- `export({ "format": "svg", "path": "logo.svg" })`: Export to SVG, AI, or PDF.

---

## 📖 3. DesignCraft (`artcraft-designcraft`)

### Key Tools:
- `new_document({ "pages": 4, "pageSize": "A4", "facingPages": true })`: Setup layout.
- `place_image({ "page": 1, "path": "cover.png", "x": 0, "y": 0 })`: Place graphic assets.
- `set_story_text({ "storyId": "main", "text": "Article body..." })`: Flow typography across text frames.
- `render_page({ "page": 1, "out": "page_1_preview.png" })`: Inspect page proofs.
- `export_png({ "page": 1, "path": "spread.png" })`: Export spreads.
