import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('ght_sync', SCRIPTS / 'sync_production_to_local.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncTests(unittest.TestCase):
    def test_reorders_export_and_preserves_semicolons_and_sequence(self):
        dump = '''PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, image_id TEXT REFERENCES image(id));
INSERT INTO parent VALUES(1,'image;one');
CREATE TABLE image (id TEXT PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
INSERT INTO image VALUES('image;one',1);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('parent',1);
CREATE INDEX image_parent ON image(parent_id);
'''
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'ordered.sql'
            sync.reorder_export(dump, output)
            result = output.read_text()
            self.assertLess(result.index('CREATE TABLE image'), result.index('INSERT INTO parent'))
            self.assertLess(result.index('DELETE FROM sqlite_sequence'), result.index('INSERT INTO sqlite_sequence'))
            db = sqlite3.connect(':memory:')
            db.executescript(result)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT image_id FROM parent').fetchone()[0], 'image;one')
            self.assertEqual(db.execute('SELECT seq FROM sqlite_sequence WHERE name = ?', ('parent',)).fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sqlite_sequence WHERE name = ?', ('parent',)).fetchone()[0], 1)

    def test_rejects_unknown_or_incomplete_sql(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'ordered.sql'
            for sql in ('DROP TABLE projects;', 'CREATE TABLE projects (id TEXT)'):
                with self.subTest(sql=sql), self.assertRaises(ValueError):
                    sync.reorder_export(sql, output)
                self.assertFalse(output.exists())

    def test_backup_before_replacing_and_restore_on_failure(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(sync, 'running_local_server', return_value=False):
            root = Path(tmp); state = root/'state'; stage = root/'stage'
            state.mkdir(); (state/'old').write_text('old')
            stage.mkdir(); (stage/'new').write_text('new')
            backup = sync.replace_state(stage, state)
            self.assertEqual((state/'new').read_text(), 'new')
            self.assertEqual((backup/'old').read_text(), 'old')
            with self.assertRaises(FileNotFoundError):
                sync.replace_state(root/'missing', state)
            self.assertEqual((state/'new').read_text(), 'new')

    def test_refuses_replacement_with_server_running(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(sync, 'running_local_server', return_value=True):
            root = Path(tmp); state = root/'state'; stage = root/'stage'
            state.mkdir(); stage.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'Stop all'):
                sync.replace_state(stage, state)
            self.assertTrue(state.is_dir())
            self.assertTrue(stage.is_dir())

    def test_missing_media_is_not_retried_as_a_network_error(self):
        error = sync.urllib.error.HTTPError('http://localhost/', 404, 'missing', {}, None)
        with patch.object(sync, 'request_copy', side_effect=error) as request:
            self.assertEqual(sync.copy_one('http://localhost/', 'token', 'missing-key'), 'missing')
            self.assertEqual(request.call_count, 1)

    def test_inspection_includes_project_and_property_originals_thumbnails_and_variants(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp); folder = state/'v3/d1/database'; folder.mkdir(parents=True)
            with sqlite3.connect(folder/'data.sqlite') as db:
                db.executescript('''
                    CREATE TABLE projects(id TEXT);
                    CREATE TABLE site_content(key TEXT,value TEXT);
                    CREATE TABLE properties(id TEXT);
                    CREATE TABLE d1_migrations(id INTEGER);
                    CREATE TABLE project_images(object_key TEXT,thumbnail_key TEXT);
                    CREATE TABLE property_images(object_key TEXT,thumbnail_key TEXT);
                    CREATE TABLE project_image_variants(object_key TEXT);
                    CREATE TABLE property_image_variants(object_key TEXT);
                    INSERT INTO project_images VALUES('project-original','project-thumb');
                    INSERT INTO project_image_variants VALUES('project-variant');
                    INSERT INTO property_images VALUES('property-original','property-thumb');
                    INSERT INTO property_image_variants VALUES('property-variant');
                    INSERT INTO site_content VALUES('studio_image_key','studio-original');
                    INSERT INTO site_content VALUES('team_1_image_variant_key','team-variant');
                    INSERT INTO site_content VALUES('studio_intro','not-a-media-key');
                ''')
            keys, counts = sync.inspect_database(state)
            self.assertEqual(set(keys), {'project-original','project-thumb','project-variant',
                                         'property-original','property-thumb','property-variant','studio-original','team-variant'})
            self.assertEqual(counts['project_images'], 1)
            self.assertEqual(counts['property_images'], 1)

    def test_copy_retries_transient_failures(self):
        with patch.object(sync, 'request_copy', side_effect=[OSError('network'), {'size':10}]) as request, \
             patch.object(sync.time, 'sleep'):
            self.assertIsNone(sync.copy_one('http://localhost/', 'token', 'key'))
            self.assertEqual(request.call_count, 2)


if __name__ == '__main__':
    unittest.main()
