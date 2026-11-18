---
name: lightcraft
description: "Use when managing photo catalogs, developing RAW images, adjusting exposure/white balance/color grading, applying presets, or performing photo merges (HDR, Panorama) using LightCraft via MCP."
---

# LightCraft MCP Guide

LightCraft is a photo library manager and non-destructive RAW developer comparable to Adobe Lightroom. It operates via the `craft-lightcraft` MCP server.

## 📸 Core Concepts

- **Non-Destructive Editing**: Adjustments modify metadata/settings (exposure, contrast, tone curves, HSL) without altering source files.
- **Library & Folders**: Catalogs track photo metadata, EXIF, tags, and development history.
- **Photo Merging**: Built-in engines for multi-exposure HDR merge and panoramic stitching.

## 🚀 Common Workflow

### 1. Library Discovery & Inspection
Discover commands and photo collections:
```json
command_list({ "filter": "develop" })
```

### 2. Import & Develop Adjustments
Adjust basic tone sliders and color parameters:
```json
// Adjust exposure, temperature, and contrast
command_run({
  "command": "develop.set",
  "params": {
    "control": "light.exposure",
    "value": 0.75
  }
})

// Auto tone adjustments
command_run({
  "command": "develop.auto"
})
```

### 3. Apply Presets or LUTs
Apply creative look presets:
```json
command_run({
  "command": "preset.apply",
  "params": {
    "id": "cinematic_warm_01"
  }
})
```

### 4. HDR & Panorama Merging
Merge bracketed exposures:
```json
command_run({
  "command": "merge.hdr",
  "params": {
    "files": ["bracket_1.dng", "bracket_2.dng", "bracket_3.dng"],
    "deghost": "medium",
    "out": "merged_hdr.dng"
  }
})
```

### 5. Render & Export
Export developed photos to JPG, PNG, TIFF, or AVIF:
```json
command_run({
  "command": "app.export",
  "params": {
    "path": "developed_photo.jpg",
    "quality": 95,
    "longEdge": 2048,
    "colorSpace": "sRGB"
  }
})
```
