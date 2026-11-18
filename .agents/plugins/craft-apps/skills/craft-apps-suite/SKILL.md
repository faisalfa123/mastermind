---
name: craft-apps-suite
description: "Master router and guide for automating the entire Craft Apps and ArtCraft suite (FigCraft, FilmCraft, LightCraft, SolidCraft, PhotoCraft, VectorCraft, DesignCraft, WordCraft, DeckCraft, AniCraft, EffectCraft, SoundCraft, CADCraft, MailCraft, Craft Anything) via MCP."
---

# Craft Apps & ArtCraft Suite Master Router

This skill routes user requests across the complete Craft Apps ecosystem installed on this system.

## 🧭 Application Routing Matrix

| Creative Task / Domain | Target Application | MCP Server | Command CLI |
| :--- | :--- | :--- | :--- |
| **UI/UX, Screens, Auto-Layout, Components** | **FigCraft** (Figma-class) | `craft-figcraft` | `figcraft-cli mcp` |
| **Video Editing, Multitrack NLE, Cuts** | **FilmCraft** (Premiere-class) | `craft-filmcraft` | `filmcraft-cli mcp` |
| **RAW Photo Developing, Lightroom Presets** | **LightCraft** (Lightroom-class) | `craft-lightcraft` | `lightcraft-cli mcp` |
| **3D Parametric CAD, Sketches, Solid Modeling** | **SolidCraft** (SolidWorks-class) | `craft-solidcraft` | `solidcraft-cli mcp` |
| **Raster Image Editing, Photo Manipulation** | **PhotoCraft** (Photoshop-class) | `artcraft-photocraft` | `photocraft-cli mcp` |
| **Vector Illustration, SVG/AI, Paths** | **VectorCraft** (Illustrator-class) | `artcraft-vectorcraft` | `vectorcraft-cli mcp` |
| **Page Layout, InDesign Documents, Publishing** | **DesignCraft** (InDesign-class) | `artcraft-designcraft` | `designcraft-cli mcp` |
| **2D Animation, Keyframing, Flash/Animate** | **AniCraft** (Animate-class) | `artcraft-anicraft` | `anicraft-cli mcp` |
| **Motion Graphics, VFX, Compositing** | **EffectCraft** (AfterEffects-class) | `artcraft-effectcraft` | `effectcraft-cli mcp` |
| **Audio Recording, Mixing, Mastering (DAW)** | **SoundCraft** (Audition-class) | `artcraft-soundcraft` | `soundcraft-cli mcp` |
| **Word Processing, Document Reports (.docx)** | **WordCraft** (Word-class) | `artcraft-wordcraft` | `wordcraft-cli mcp` |
| **Slide Decks, Presentations (.pptx)** | **DeckCraft** (PowerPoint-class) | `artcraft-deckcraft` | `deckcraft-cli mcp` |
| **2D Technical Drafting, Architectural CAD** | **CADCraft** (AutoCAD-class) | `artcraft-cadcraft` | `cadcraft-cli mcp` |
| **Mail, Contacts, Calendar Management** | **MailCraft** (Outlook-class) | `craft-mailcraft` | `mailcraft-cli mcp` |
| **App Analysis, Rebuilding, Reverse Eng** | **Craft Anything** | `craft-anything` | `craft-anything-cli mcp` |

---

## 🛠️ General MCP Workflow Pattern

1. **Discovery**: Call `list_commands` or `command_list` to see available command IDs and parameter schemas.
2. **Inspection**: Call `doc_inspect`, `inspect_document`, or `get_node` to understand current document hierarchy.
3. **Execution**: Use `run_command`, `execute`, or `command_run` for single operations; use `batch` or `command_batch` for grouped atomic steps.
4. **Visual Verification**: Call `render_preview`, `screenshot`, or `render_page` to check visual output.
5. **Persistence**: Call `doc_save`, `save`, or `export` to write native or standard export files.
