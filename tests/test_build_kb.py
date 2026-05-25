"""Tests for the knowledge-base compiler."""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, "netlify", "functions", "lib", "knowledge.mjs")


def _load_build_module():
    path = os.path.join(ROOT, "scripts", "build_kb.py")
    spec = importlib.util.spec_from_file_location("build_kb", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["build_kb"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_build_writes_knowledge_mjs():
    build_kb = _load_build_module()
    out = build_kb.build()
    assert os.path.exists(out)

    with open(out, "r", encoding="utf-8") as fh:
        content = fh.read()

    # The generated file exports KB as a JS const.
    assert "export const KB =" in content
    # Sample content from content/ is present.
    assert "Sam Rivera" in content
    assert "Acme Docs" in content
    # Section headers are emitted per source file.
    assert "SOURCE: about.md" in content
    assert "SOURCE: faq.md" in content


def test_kb_is_valid_json_string():
    import json

    build_kb = _load_build_module()
    out = build_kb.build()
    with open(out, "r", encoding="utf-8") as fh:
        content = fh.read()

    # Extract the JSON-encoded string literal and confirm it round-trips.
    start = content.index("export const KB =") + len("export const KB =")
    end = content.rindex(";")
    literal = content[start:end].strip()
    decoded = json.loads(literal)
    assert isinstance(decoded, str)
    assert "Sam" in decoded
