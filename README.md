# Nine-slice editor

A [GAMS](https://github.com/kkgams/gams) View for defining named regions, horizontal/vertical three-slices and nine-slices in a texture atlas. Open an atlas through the Project file chooser; no sample artwork is bundled.

| View | Source / release file | License / author |
| --- | --- | --- |
| `view-nine` | `src/views/view-nine.js` / `view.nine.zip` | [Apache-2.0](LICENSE), GAMS contributors; [NOTICE](NOTICE) |

## Development

Requires Make, Node.js 24, Python 3, curl, zip, unzip and tar. No package installation or sibling checkout is required. Native launch/download supports macOS Apple Silicon.

| Command | Purpose |
| --- | --- |
| `make build` | Assemble model and View into `build.nosync/views/view-nine.js` |
| `make check` | Check both source modules and assembled JavaScript syntax |
| `make test` | Run native Node tests in `test/*.test.mjs` |
| `make open` | Build and open local `gams.json` in pinned released GAMS |
| `make package` | Incrementally build `build.nosync/view.nine.zip` and `SHA256SUMS` |
| `make serve-docs` | Preview pinned wiki; independent `DOCS_PORT=8089` |
| `make validate-docs` | Validate wiki |
| `make docs` | Build `build.nosync/docs/` |
| `make clean` | Remove generated output and marked Host download; preserve unmarked v3.1.1 Unit caches; refuse tracked output, symlinks and unidentified Host tools |

Edit `src/model.mjs` and `src/views/view-nine.js`. Make strips model exports and combines the modules for the Host's blob loader; absolute `/util` and `/widgets` imports remain Host-owned. First launch downloads the pinned Host and configured released Units. Existing Host downloads are retained without implicit updates, with notices beside the app. Launch selects this repository with `GAMS_APP_CWD` and `GAMS_CONFIG`.

The local `gams.json` uses native `$file` resources with the pinned GAMS v3.2.0 Host. ZIP sources select their entry explicitly. Existing downloaded Hosts are not replaced automatically; unmarked legacy Unit caches under `gams_modules/` are retained by clean.

The ZIP contains `views/view-nine.js`, `LICENSE` and `NOTICE`, not Project configuration or downloaded dependencies. Follow the [Host View guide](https://github.com/kkgams/gams/blob/release/docs/gams-view-development-guide.md) for UI contracts.

[Editing and document format](docs/index.md).
