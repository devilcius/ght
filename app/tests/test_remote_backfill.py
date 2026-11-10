import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('backfill', Path(__file__).resolve().parents[1] / 'scripts' / 'backfill_remote_images.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackfillConfigTests(unittest.TestCase):
    def test_jsonc_comments_and_trailing_commas_preserve_strings(self):
        data = module.parse_jsonc('{"url":"https://example.com/a,}", /* comment */ "values":[1,2,], // comment\n}')
        self.assertEqual(data, {'url': 'https://example.com/a,}', 'values': [1, 2]})

    def test_uses_only_the_configured_bindings_as_remote(self):
        original = {'compatibility_date':'2026-02-10', 'd1_databases':[{'binding':'DB','database_name':'ght','database_id':'db-id'}], 'r2_buckets':[{'binding':'MEDIA','bucket_name':'ght-media'}]}
        result = module.make_config(original, 'a'*32)
        self.assertTrue(result['d1_databases'][0]['remote'])
        self.assertTrue(result['r2_buckets'][0]['remote'])
        self.assertEqual(result['d1_databases'][0]['database_id'], 'db-id')
        self.assertNotIn('remote', original['d1_databases'][0])

    def test_rejects_placeholder_or_missing_database_name(self):
        for db in ({'binding':'DB','database_id':'db-id'}, {'binding':'DB','database_name':'ght','database_id':'local-placeholder'}):
            with self.assertRaises(ValueError):
                module.make_config({'compatibility_date':'2026-02-10','d1_databases':[db],'r2_buckets':[{'binding':'MEDIA','bucket_name':'ght-media'}]}, 'a'*32)


if __name__ == '__main__':
    unittest.main()
