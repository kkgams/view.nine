---
title: Nine-slice editor
status: reference
---

# Nine-slice editor

Use `view-nine` in GAMS to define named nine-slice regions in a texture atlas. Open an image through the Project file chooser; artwork remains in your Project.

Each slice has an outer `bounds` rectangle in atlas pixels and an inner `center` rectangle relative to the bounds origin. The center defines the stretchable area; the surrounding regions define edges and corners. For example, a center at `(4, 4)` starts four pixels from the slice's upper-left corner, not from the atlas origin.

## Editing

1. Choose **New from atlas** and select a PNG, JPEG or WebP inside the Project. Paths are relative to the Project root, even when the JSON is saved in a subdirectory.
2. Choose **Add slice** or **Draw slice**, then drag its outer rectangle over the atlas. New slices get an initial stretch center.
3. Select a slice from the side-panel list or click its box. In **Select / move**, drag the box to move it or yellow outer handles to resize bounds. Choose **Stretch center** to drag cyan inner handles. Separate tools keep even coincident one-pixel handles selectable. All edits snap to integer pixels and stay inside the image. Overlapping slices are allowed; the list can select any slice.
4. Edit the selected slice's name, bounds and relative center below the list. Names must be unique; both rectangles must have positive dimensions. Invalid edits are rejected with an error notification.
5. Use **Save** or **Save as** to write JSON through the Project filesystem. **Open JSON** restores it and its atlas. Saves write a temporary sibling file and rename it into place after writing succeeds, preserving the existing destination on write failures. A failed save may leave a temporary file whose path appears in the error notification. Save or explicitly **Discard changes** before opening another document. Discard restores the last saved state and clears undo history.

**Undo** and **Redo** include drawing, moving, resizing, deleting and property edits. Escape cancels a drag; leaving the canvas commits it. Wheel scrolling pans, Ctrl/Command+wheel zooms at the pointer, and Space+drag pans. Header controls provide zoom in/out and fit-to-atlas through the shared Host canvas base. Text fields retain normal typing behavior.

The format is independent of Aseprite's animation-oriented slice export; it does not import `.aseprite` files or define frame keys or pivots.

## Document format

Save nine-slice definitions as JSON:

```json
{
  "format": "gams.nine",
  "version": 1,
  "image": "atlas.png",
  "slices": [
    {
      "name": "panel",
      "bounds": { "x": 16, "y": 24, "width": 32, "height": 32 },
      "center": { "x": 4, "y": 4, "width": 24, "height": 24 }
    }
  ]
}
```

`image` is the Project-relative atlas image path. Rectangle coordinates and dimensions are integer pixels. Keep the center inside its slice bounds.

## Local development

Run `make open` to assemble the local source and open the configured released Host. Use `make check` for syntax and `make test` for native model tests. `make package` produces `build.nosync/view.nine.zip` and `SHA256SUMS`; the archive installs `views/view-nine.js` with its license and notices. Configure the supporting plugins, theme and UI Services separately in each consuming Project.

Use `make serve-docs` for this wiki on port 8089 (`DOCS_PORT` overrides it), `make validate-docs` to validate it and `make docs` to build it. See the [repository](https://github.com/kkgams/view.nine) for development commands.
