---
title: Atlas slice editor
status: reference
---

# Atlas slice editor

Use `view-nine` in GAMS to define named regions, horizontal or vertical three-slices, and nine-slices in a texture atlas. Open an image through the Project file chooser; artwork remains in your Project.

Choose an explicit type for each slice:

| Type | Saved `type` | Stretch controls |
| --- | --- | --- |
| Region | `region` | None; bounds only |
| Horizontal 3-slice | `horizontal` | Left/right dividers; stretches horizontally |
| Vertical 3-slice | `vertical` | Top/bottom dividers; stretches vertically |
| 9-slice | `nine` | Both divider pairs |

Each slice has an outer `bounds` rectangle in atlas pixels. Stretchable types also have an inner `center` rectangle relative to the bounds origin; Region omits `center` entirely. The center defines the stretchable area; the surrounding regions define edges and corners. For example, a center at `(4, 4)` starts four pixels from the slice's upper-left corner, not from the atlas origin.

## Editing

1. Choose **New from atlas** and select a PNG, JPEG or WebP inside the Project. Paths are relative to the Project root, even when the JSON is saved in a subdirectory.
2. Choose **Draw slice** in the header, then drag its outer rectangle over the atlas. The header **New slice type** selector controls what drawing creates. Stretchable types get an initial stretch center at thirds. Drawing reuses the last chosen type; changing a selected slice’s Type also updates that drawing choice.
3. Select a slice from the side-panel list or click its box. In **Select / move**, drag the box to move it or yellow outer handles to resize bounds. Drag a blue divider anywhere along its length to adjust that stretch border in either selection tool; drag an intersection to adjust both axes. Choose **Stretch center** for cyan inner handles when bounds and center overlap. Divider drags preserve the pointer's initial offset so nearby grabs do not jump. All edits snap to integer pixels and stay inside the image. Overlapping slices are allowed; the list can select any slice.
4. Edit the selected slice’s type, name, bounds and relative center below the list. Only active stretch-axis fields, dividers and center handles are available. Type conversion preserves bounds and existing stretch coordinates on shared axes; newly enabled axes start at thirds. Names must be unique; both rectangles must have positive dimensions. Invalid edits are rejected with an error notification.
5. Use **Save** or **Save as** to write JSON through the Project filesystem. **Open JSON** restores it and its atlas. Saves write a temporary sibling file and rename it into place after writing succeeds, preserving the existing destination on write failures. A failed save may leave a temporary file whose path appears in the error notification. Save or explicitly **Discard changes** before opening another document. Discard restores the last saved state and clears undo history.

Regions have no stretch controls. **Stretch center** is unavailable when no stretchable slice is selected. Bounds resizing preserves fixed borders where space permits, clamps the stretch center to at least one pixel, and keeps inactive axes spanning the full bounds.

Slice names are selectable text rows. Click a name or use Up/Down, Home/End, Enter or Space while the row is focused. Each row has a bin icon that deletes that slice without selecting it first; deleting another slice preserves the current selection. Header actions use labelled icons with hover tips.

**Undo** and **Redo** include drawing, moving, resizing, divider dragging, deleting and property edits. Escape cancels a drag; leaving the canvas commits it. Wheel scrolling pans, Ctrl/Command+wheel zooms at the pointer, and Space+drag pans. Header controls provide zoom in/out and fit-to-atlas through the shared Host canvas base. Text fields retain normal typing behavior.

The format is independent of Aseprite's animation-oriented slice export; it does not import `.aseprite` files or define frame keys or pivots.

## Document format

Save mixed slice definitions as JSON:

```json
{
  "format": "gams.nine",
  "version": 1,
  "image": "atlas.png",
  "slices": [
    {
      "name": "panel",
      "type": "nine",
      "bounds": { "x": 16, "y": 24, "width": 32, "height": 32 },
      "center": { "x": 4, "y": 4, "width": 24, "height": 24 }
    }
  ]
}
```

`image` is the Project-relative atlas image path. Every slice requires an explicit `type`; missing or unknown types are rejected. Rectangle coordinates and dimensions are integer pixels. Keep the center inside its slice bounds, with positive width and height. Zero-width fixed borders are allowed.

- `region`: omit `center`.
- `horizontal`: `center.y` must be `0` and `center.height` must equal `bounds.height`.
- `vertical`: `center.x` must be `0` and `center.width` must equal `bounds.width`.
- `nine`: both center axes are editable.

This is the initial version-1 contract; there is no legacy loading or type inference.

## Local development

Run `make open` to assemble the local source and open the configured released Host. Use `make check` for syntax and `make test` for native model tests. `make package` produces `build.nosync/view.nine.zip` and `SHA256SUMS`; the archive installs `views/view-nine.js` with its license and notices. Configure the supporting plugins, theme and UI Services separately in each consuming Project.

Use `make serve-docs` for this wiki on port 8089 (`DOCS_PORT` overrides it), `make validate-docs` to validate it and `make docs` to build it. See the [repository](https://github.com/kkgams/view.nine) for development commands.
