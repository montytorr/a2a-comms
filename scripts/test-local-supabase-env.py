#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('sync_env', Path(__file__).with_name('sync-local-supabase-env.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class EnvironmentSync(unittest.TestCase):
    def test_opt_in_preserves_unrelated_values_and_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); target = root / '.env'; source = root / 'stack.env'
            source.write_text('SUPABASE_PUBLIC_URL=https://local.example/supabase\nANON_KEY=public-test\nSERVICE_ROLE_KEY=private-test\n')
            target.write_text(f'SUPABASE_STACK_ENV={source}\nNEXT_PUBLIC_SUPABASE_URL=https://old.example\nRESEND_FROM=Name <mail@example.com>\n')
            target.chmod(0o600)
            self.assertTrue(module.sync(target))
            result = module.read_env(target)
            self.assertEqual(result['NEXT_PUBLIC_SUPABASE_URL'], 'https://local.example/supabase')
            self.assertEqual(result['RESEND_FROM'], 'Name <mail@example.com>')
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            first = target.read_bytes(); module.sync(target)
            self.assertEqual(target.read_bytes(), first)
    def test_incomplete_source_leaves_target_intact(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); target = root / '.env'; source = root / 'stack.env'
            source.write_text('ANON_KEY=public-test\n'); target.write_text(f'SUPABASE_STACK_ENV={source}\n')
            before = target.read_bytes()
            with self.assertRaises(ValueError): module.sync(target)
            self.assertEqual(target.read_bytes(), before)
    def test_managed_deployment_is_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / '.env'; target.write_text('NEXT_PUBLIC_SUPABASE_URL=https://managed.example\n')
            before = target.read_bytes(); self.assertFalse(module.sync(target))
            self.assertEqual(target.read_bytes(), before)
if __name__ == '__main__': unittest.main()
