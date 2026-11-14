"""Assemble the model and Host View into one blob-loadable ES module."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
model = (ROOT / "src/model.mjs").read_text()
# Model declarations are public for native tests, local in the assembled View.
model = re.sub(r"^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)", "", model, flags=re.MULTILINE)
model = re.sub(r"^export\s*\{[^}]*\};?\s*$", "", model, flags=re.MULTILINE)
if re.search(r"^\s*(?:import|export)\b", model, flags=re.MULTILINE):
    raise SystemExit("Model must use named declaration exports and no imports")
view = (ROOT / "src/views/view-nine.js").read_text()
output = ROOT / "build.nosync/views/view-nine.js"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(model + "\n;\n" + view)
