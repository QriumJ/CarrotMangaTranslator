import importlib.util
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

WORKER = Path(__file__).resolve().parents[2] / 'src/main/runtime/flux-klein-python-worker.py'
SPEC = importlib.util.spec_from_file_location('flux_revision_worker', WORKER)
with patch.dict(sys.modules, {'PIL': SimpleNamespace(Image=Mock())}):
    worker = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(worker)

REVISION = 'e7b7dc27f91deacad38e78976d1f2b499d76a294'

class FluxRevisionTests(unittest.TestCase):
    def test_pipeline_uses_exact_revision_offline(self):
        pipe = Mock()
        pipeline_class = SimpleNamespace(from_pretrained=Mock(return_value=pipe))
        torch = SimpleNamespace(float32='float32')
        args = SimpleNamespace(backend='cpu', gguf_transformer=None, model_id='example/model', cache_dir='cache', mode='klein-edit-composite', revision=REVISION)
        with patch.dict(sys.modules, {'torch': torch, 'diffusers': SimpleNamespace(Flux2KleinPipeline=pipeline_class)}), patch.dict(worker.os.environ, {}, clear=True):
            result, device = worker.load_pipeline(args)
        self.assertIs(result, pipe)
        self.assertEqual(device, 'cpu')
        pipeline_class.from_pretrained.assert_called_once_with('example/model', cache_dir='cache', torch_dtype='float32', revision=REVISION, local_files_only=True)

    def test_gguf_config_never_falls_back_to_unpinned_remote(self):
        with tempfile.TemporaryDirectory() as directory:
            gguf = Path(directory) / 'fixture.gguf'
            gguf.write_bytes(b'gguf')
            loader = Mock(side_effect=RuntimeError('missing pinned config'))
            diffusers = SimpleNamespace(GGUFQuantizationConfig=Mock(), Flux2Transformer2DModel=SimpleNamespace(from_single_file=loader))
            with self.assertRaisesRegex(RuntimeError, 'Unable to load'):
                worker.load_gguf_transformer(diffusers, SimpleNamespace(), str(gguf), 'example/model', directory, 'float32', REVISION)
            self.assertEqual(loader.call_count, 1)
            self.assertEqual(loader.call_args.kwargs['revision'], REVISION)
            self.assertTrue(loader.call_args.kwargs['local_files_only'])
            self.assertEqual(loader.call_args.kwargs['config'], 'example/model')

    def test_cli_rejects_moving_revision(self):
        with patch.object(sys, 'argv', ['worker', '--backend', 'cpu', '--model-id', 'example/model', '--cache-dir', 'cache', '--revision', 'main']):
            with self.assertRaises(SystemExit):
                worker.parse_args()

if __name__ == '__main__':
    unittest.main()
