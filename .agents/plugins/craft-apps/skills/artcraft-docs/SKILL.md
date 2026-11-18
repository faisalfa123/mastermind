---
name: artcraft-docs
description: "Use when creating Word documents (WordCraft), presentation slide decks (DeckCraft), technical CAD drawings (CADCraft), or managing mail and calendars (MailCraft) via ArtCraft MCP servers."
---

# ArtCraft Documents & Productivity Guide

This skill covers the document and productivity applications in the ArtCraft suite:

1. **WordCraft** (`artcraft-wordcraft`): Word-class rich text word processor (.docx).
2. **DeckCraft** (`artcraft-deckcraft`): PowerPoint-class presentation slide designer (.pptx).
3. **CADCraft** (`artcraft-cadcraft`): AutoCAD-class 2D/3D technical drafting engine (.dxf, .dwg).
4. **MailCraft** (`craft-mailcraft`): Outlook-class email, contacts, and calendar automation.

---

## 📝 1. WordCraft (`artcraft-wordcraft`)

### Key Tools:
- `new_document()` / `open_document({ "path": "report.docx" })`: Open or create document.
- `type_text({ "text": "Executive Summary" })`: Insert text at active caret.
- `execute({ "command": "para.style", "params": { "style": "Heading 1" } })`: Apply styles.
- `insert_table({ "rows": 4, "cols": 3 })`: Insert tables.
- `render_page({ "page": 1, "out": "page_proof.png" })`: Inspect page proof visually.
- `save_document({ "path": "final_report.docx" })`: Save document or export to PDF.

---

## 📊 2. DeckCraft (`artcraft-deckcraft`)

### Key Tools:
- `new_presentation({ "theme": "Modern Dark" })`: Create presentation.
- `add_slide({ "layout": "Title and Content" })`: Add new slide.
- `add_text_box({ "slide": 1, "text": "Quarterly Growth", "x": 100, "y": 80 })`: Insert text.
- `insert_chart({ "slide": 1, "type": "bar", "data": [[ "Q1", 20 ], [ "Q2", 35 ]] })`: Insert charts.
- `render_slide({ "slide": 1, "out": "slide_1.png" })`: Render visual preview.
- `save_presentation({ "path": "pitch_deck.pptx" })`: Save presentation.

---

## 📐 3. CADCraft (`artcraft-cadcraft`)

### Key Tools:
- `new_drawing()` / `open({ "path": "floorplan.dxf" })`: Manage drawing files.
- `query_entities({ "type": "LINE" })`: Query drawing geometry.
- `execute({ "command": "draw.line", "params": { "start": [0, 0], "end": [5000, 0] } })`: Add CAD geometry.
- `render({ "out": "blueprint.png", "width": 1920 })`: Render drawing preview.
- `save({ "path": "updated_plan.dxf" })`: Save DXF/DWG files.

---

## ✉️ 4. MailCraft (`craft-mailcraft`)

### Key Tools:
- `info({ "mailbox": "default" })`: Get account statistics and folder status.
- `list({ "mailbox": "default", "folder": "inbox", "limit": 10 })`: List emails.
- `show({ "mailbox": "default", "id": "msg_123" })`: Read message contents.
- `run_command({ "cmd": "mail.send", "params": { "to": "client@example.com", "subject": "Update", "body": "..." } })`: Send or draft emails.
