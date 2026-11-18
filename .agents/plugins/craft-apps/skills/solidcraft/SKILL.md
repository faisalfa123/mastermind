---
name: solidcraft
description: "Use when creating 3D CAD parts, parametric solid models, 2D constraint sketches, extrude/revolve/fillet features, or exporting STEP/STL files using SolidCraft via MCP."
---

# SolidCraft MCP Guide

SolidCraft is a parametric 3D CAD solid modeling engine comparable to SolidWorks, Autodesk Fusion 360, and Onshape. It operates via the `craft-solidcraft` MCP server.

## 🧊 Core Concepts

- **Parametric Feature Tree**: Sketches ➔ Extrude / Revolve / Sweep ➔ Fillet / Chamfer / Shell ➔ Assembly.
- **Sketches**: 2D geometric profiles drawn on planar datum faces with constraints and dimensions.
- **B-Rep Solids**: Solid bodies evaluated by the geometry kernel with mass, volume, and boundary surface representation.

## 🚀 Common Workflow

### 1. Document & Body Inspection
Inspect existing bodies, sketches, and features in the active design:
```json
inspect_design()
```

### 2. Create Sketch on Plane
Create a sketch on XY, XZ, or YZ datum plane:
```json
command_run({
  "command": "sketch.new",
  "params": {
    "plane": "XY",
    "name": "BaseProfile"
  }
})

// Add rectangle geometry
command_run({
  "command": "sketch.addRect",
  "params": {
    "center": [0, 0],
    "width": 100.0,
    "height": 50.0
  }
})
```

### 3. Solid Modeling (Extrude, Revolve, Cut)
Generate solid volume from sketch:
```json
command_run({
  "command": "feature.extrude",
  "params": {
    "sketch": "BaseProfile",
    "distance": 25.0,
    "operation": "new_body"
  }
})
```

### 4. Visual Verification (Viewport Snapshot)
Capture an isometric snapshot of the 3D model:
```json
snapshot({
  "view": "iso",
  "width": 1280,
  "height": 720,
  "out": "part_preview.png"
})
```

### 5. Export Engineering Assets
Export model to standard CAD interchange formats (STEP, IGES, STL, 3MF):
```json
command_run({
  "command": "file.export",
  "params": {
    "format": "step",
    "out": "bracket_model.step"
  }
})
```
