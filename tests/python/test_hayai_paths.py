"""Exercise the real Hayai file pipeline without downloading model packages."""
from __future__ import annotations

import argparse
import contextlib
import sys
import math
import re
import unicodedata
import ast
from contextlib import redirect_stdout
from io import StringIO
import json
import ntpath
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock


SCRIPT = Path(__file__).resolve().parents[2] / "src/main/runtime/hayai-bboxes.py"


def load_file_pipeline():
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    functions = {
        "main", "serve", "parse_args", "runtime_path", "read_batch_items",
        "normalize_batch_item", "read_json", "emit_progress", "process_page",
        "require_regions", "require_box", "box_contains", "dialogue_hint", "normalize_text", "effect_item",
    }
    nodes = [ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)]
    nodes.extend(node for node in tree.body if (
        isinstance(node, ast.FunctionDef) and node.name in functions
    ) or isinstance(node, ast.Assign))
    namespace = dict(argparse=argparse, json=json, os=os, Path=Path, contextlib=contextlib, sys=sys, math=math, re=re, unicodedata=unicodedata)
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), str(SCRIPT), "exec"), namespace)
    return namespace


def fixture_path(path):
    """Create fixtures independently of production path conversion."""
    return Path("\\\\?\\" + str(path)) if os.name == "nt" else path


class ImageFile:
    """Image decoder boundary: require the actual file to be readable."""
    size = (10, 20)
    width, height = size

    def __init__(self, path):
        if Path(path).read_bytes() != b"fixture-image":
            raise ValueError("Invalid test image")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def convert(self, _mode):
        return self


class HayaiPathsTest(unittest.TestCase):
    def setUp(self):
        self.runtime = load_file_pipeline()

    def test_windows_drive_unc_and_existing_namespace(self):
        windows = SimpleNamespace(name="nt", path=ntpath)
        with patch.dict(self.runtime, os=windows):
            convert = self.runtime["runtime_path"]
            suffix = "\\".join(["원문 space" * 8] * 5)
            drive = "C:\\library\\" + suffix + "\\batch.json"
            unc = "\\\\server\\share\\" + suffix + "\\batch.json"
            self.assertEqual(str(convert(drive)), "\\\\?\\" + drive)
            self.assertEqual(str(convert(unc)), "\\\\?\\UNC\\" + unc[2:])
            self.assertEqual(str(convert("\\\\?\\" + drive)), "\\\\?\\" + drive)
            self.assertEqual(str(convert("batch.json")), "batch.json")
            boundary = "C:\\" + "a" * 244
            self.assertEqual(str(convert(boundary)), boundary)
            self.assertEqual(str(convert(boundary + "a")), "\\\\?\\" + boundary + "a")
            forward = drive.replace("\\", "/").replace("/batch.json", "/../batch.json")
            self.assertEqual(str(convert(forward)), "\\\\?\\" + ntpath.abspath(forward))

    def test_posix_paths_are_preserved(self):
        with patch.dict(self.runtime, os=SimpleNamespace(name="posix")):
            path = "/tmp/" + "/".join(["source" * 20] * 3) + "/batch.json"
            self.assertEqual(self.runtime["runtime_path"](path), Path(path))

    def test_long_relative_windows_path_is_made_absolute(self):
        long_root = "C:\\" + "\\".join(["workspace" * 9] * 4)
        windows = SimpleNamespace(name="nt", path=SimpleNamespace(abspath=lambda value: ntpath.join(long_root, value)))
        with patch.dict(self.runtime, os=windows):
            self.assertEqual(str(self.runtime["runtime_path"]("batch.json")), "\\\\?\\" + long_root + "\\batch.json")

    def test_missing_and_invalid_manifests_still_fail(self):
        with tempfile.TemporaryDirectory(prefix="hayai-errors-") as root:
            path = Path(root) / "batch.json"
            args = argparse.Namespace(batch=str(path))
            with self.assertRaises(FileNotFoundError):
                self.runtime["read_batch_items"](args)
            path.write_text('{"items": []}', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "contains no items"):
                self.runtime["read_batch_items"](args)
            path.write_text('{"items": [{"image": "page.png"}]}', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "requires image, regions, and output"):
                self.runtime["read_batch_items"](args)

    def test_batch_and_single_page_read_and_write_long_paths(self):
        # Includes all five path boundaries: batch, image, regions, output, progress.
        temporary = tempfile.TemporaryDirectory(prefix="hayai-paths-")
        with temporary as root:
            # Cleanup must also work in the deliberately non-long-path-aware
            # Python smoke process; test input paths themselves stay ordinary.
            temporary.name = str(fixture_path(Path(root)))
            directory = Path(root).joinpath(*(["원문 space-" + "a" * 60] * 4))
            fixture_path(directory).mkdir(parents=True)
            image = directory / "block-1.png"
            regions = directory / "hayai-regions.json"
            output = directory / "new-output" / "ocr-bbox-hints.json"
            batch = directory / "ocr-batch.json"
            fixture_path(image).write_bytes(b"fixture-image")
            fixture_path(regions).write_text(json.dumps({
                "schemaVersion": self.runtime["REGION_SCHEMA"],
                "width": 10, "height": 20,
                "dialogueRegions": [], "effectRegions": [],
            }), encoding="utf-8")
            fixture_path(batch).write_text(json.dumps({"items": [{
                "image": str(image), "regions": str(regions), "output": str(output),
            }]}), encoding="utf-8")
            for mode in ("batch", "single"):
                with self.subTest(mode=mode):
                    progress = directory / "new-progress" / (mode + ".jsonl")
                    argv = [str(SCRIPT), "--progress", str(progress)]
                    argv += ["--batch", str(batch)] if mode == "batch" else [
                        "--image", str(image), "--regions", str(regions), "--output", str(output),
                    ]
                    # Only the heavyweight model/decoder boundaries are replaced.
                    with patch.dict(self.runtime, {
                        "load_runtime": lambda _args: (None, None, None, None),
                        "release_gpu_memory": lambda: None,
                        "Image": SimpleNamespace(open=ImageFile),
                        "ImageOps": SimpleNamespace(exif_transpose=lambda image: image),
                    }), patch("sys.argv", argv), redirect_stdout(StringIO()):
                        self.assertEqual(self.runtime["main"](), 0)
                    payload = json.loads(fixture_path(output).read_text(encoding="utf-8"))
                    self.assertEqual(payload["schemaVersion"], self.runtime["OUTPUT_SCHEMA"])
                    self.assertEqual(payload["items"], [])
                    events = [json.loads(line) for line in fixture_path(progress).read_text(encoding="utf-8").splitlines()]
                    self.assertEqual([event["phase"] for event in events], ["start", "done"])

    def test_worker_reuses_model_and_preserves_single_page_output(self):
        with tempfile.TemporaryDirectory(prefix="hayai-worker-") as root:
            root = Path(root)
            image, regions = root / "image.png", root / "regions.json"
            image.write_bytes(b"fixture-image")
            regions.write_text(json.dumps({
                "schemaVersion": self.runtime["REGION_SCHEMA"], "width": 10, "height": 20,
                "dialogueRegions": [{"id": 1, "regionId": "block", "kind": "dialogue", "bbox": [0, 0, 10, 20],
                                     "recognitionBboxes": [[0, 0, 5, 20], [5, 0, 10, 20]]}],
                "effectRegions": [],
            }), encoding="utf-8")
            load = Mock(return_value=(None, None, None, None))
            boundaries = {"load_runtime": load, "release_gpu_memory": lambda: None,
                          "Image": SimpleNamespace(open=ImageFile), "ImageOps": SimpleNamespace(exif_transpose=lambda image: image),
                          "crop_region": lambda image, box: box,
                          "recognize_batch_resilient": lambda *args, **kwargs: ["原", "文"]}
            argv = [str(SCRIPT), "--image", str(image), "--regions", str(regions), "--output", str(root / "single.json")]
            with patch.dict(self.runtime, boundaries), patch("sys.argv", argv), redirect_stdout(StringIO()):
                self.runtime["main"]()
            load.reset_mock()
            commands = [{"id": str(i), "image": str(image), "regions": str(regions), "output": str(root / f"worker-{i}.json")} for i in range(3)]
            stdin = StringIO("\n".join(json.dumps(c) for c in [*commands, {"type": "shutdown"}]) + "\n")
            stdout = StringIO()
            with patch.dict(self.runtime, boundaries), patch("sys.argv", [*argv, "--worker"]), patch("sys.stdin", stdin), redirect_stdout(stdout):
                self.assertEqual(self.runtime["main"](), 0)
            self.assertEqual(load.call_count, 1)
            self.assertEqual([json.loads(line)["ok"] for line in stdout.getvalue().splitlines()], [True] * 3)
            baseline = json.loads((root / "single.json").read_text(encoding="utf-8"))
            for i in range(3):
                self.assertEqual(json.loads((root / f"worker-{i}.json").read_text(encoding="utf-8")), baseline)

    def test_worker_page_failure_is_explicit_and_cpu_can_continue(self):
        load = Mock(return_value=(None, None, None, None))
        process = Mock(side_effect=[None, ValueError("broken page"), None])
        commands = [{"id": str(i), "image": "i", "regions": "r", "output": "o"} for i in range(3)]
        output = StringIO()
        with patch.dict(self.runtime, {"load_runtime": load, "process_page": process, "release_gpu_memory": lambda: None}), \
             patch("sys.argv", [str(SCRIPT), "--worker", "--device", "cpu"]), \
             patch("sys.stdin", StringIO("\n".join(json.dumps(c) for c in commands))), redirect_stdout(output):
            self.assertEqual(self.runtime["main"](), 0)
        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([r["ok"] for r in responses], [True, False, True])
        self.assertFalse(responses[1]["fatal"])
        self.assertEqual(load.call_count, 1)


if __name__ == "__main__":
    unittest.main()
