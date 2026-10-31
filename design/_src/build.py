"""Inline design/_src/skins.css and skin-switch.js into studio artboards.

Artboards stay self-contained (gentle-design rule). Each studio artboard marks the spots with
`/*@skins*/` inside its <style> and `<!--@switch-js-->` before </body>. Run from the repo root:
    python3 design/_src/build.py
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent
skins = (root / "skins.css").read_text()
switch = (root / "skin-switch.js").read_text()
workspace = (root / "workspace.css").read_text()

for path in sorted((root.parent / "studio-ui").glob("*.html")):
    html = path.read_text()
    html = re.sub(r"/\*@skins\*/.*?/\*@end-skins\*/", lambda _: f"/*@skins*/\n{skins}/*@end-skins*/", html, flags=re.S)
    html = re.sub(r"/\*@workspace\*/.*?/\*@end-workspace\*/", lambda _: f"/*@workspace*/\n{workspace}/*@end-workspace*/", html, flags=re.S)
    html = re.sub(r"<!--@switch-js-->.*?<!--@end-switch-js-->", lambda _: f"<!--@switch-js--><script>\n{switch}</script><!--@end-switch-js-->", html, flags=re.S)
    path.write_text(html)
    print(f"inlined skins into {path.relative_to(root.parent.parent)}")
