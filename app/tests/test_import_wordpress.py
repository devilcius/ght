import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'scripts' / 'import_wordpress.py'
spec = importlib.util.spec_from_file_location('import_wordpress', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportTests(unittest.TestCase):
    def test_mysql_rows_preserve_escaped_content_and_multiple_tuples(self):
        source = "INSERT INTO `wq5aC_posts` VALUES (1,'O\\'Brien','line\\nnext'),(2,'x,y','slash\\\\name');"
        self.assertEqual(list(module.sql_rows(source, 'posts')), [['1', "O'Brien", 'line\nnext'], ['2', 'x,y', 'slash\\name']])

    def test_project_gallery_preserves_order_and_reports_missing_slot(self):
        def post(pid, kind, title, slug, status):
            row = [pid, '1', '', '', '', title, '', status, '', '', '', slug, '', '', '', '', '', '', '', '0', kind, '', '0']
            return '(' + ','.join("'" + x.replace("'", "\\'") + "'" for x in row) + ')'
        def insert(table, rows):
            return f'INSERT INTO `wq5aC_{table}` VALUES ' + ','.join(rows) + ';\n'
        with tempfile.TemporaryDirectory() as directory:
            uploads = Path(directory)
            (uploads / 'a.jpg').write_bytes(b'a')
            (uploads / 'b.jpg').write_bytes(b'b')
            source = insert('posts', [post('1', 'proyectos', 'Example', 'example', 'publish'), post('2', 'attachment', 'A', 'a', 'inherit'), post('3', 'attachment', 'B', 'b', 'inherit')])
            entries = [('1', 'galeria', '3'), ('1', 'galeria_0_item_imagen', '3'), ('1', 'galeria_1_item_imagen', ''), ('1', 'galeria_2_item_imagen', '2'), ('2', '_wp_attached_file', 'a.jpg'), ('3', '_wp_attached_file', 'b.jpg'), ('1', 'situacion__', 'Madrid')]
            source += insert('postmeta', [f"('{i}','{pid}','{key}','{value}')" for i, (pid, key, value) in enumerate(entries)])
            source += insert('terms', ["('4','Residencial','residencial','0')"])
            source += insert('term_taxonomy', ["('5','4','categoria_proyectos','','0','1')"])
            source += insert('term_relationships', ["('1','5','0')"])
            result = module.load(source, uploads)[0]
            self.assertEqual([x['path'] for x in result['images']], ['b.jpg', 'a.jpg'])
            self.assertEqual(result['category'], 'Residencial')
            self.assertIn('gallery slot 2 is empty', result['warnings'])

    def test_resume_only_uploads_missing_images_and_restores_cover(self):
        project = {'wordpress_id': '10', 'title': 'Example', 'slug': 'example',
                   'category': '', 'location': '', 'year': '', 'description': '',
                   'featured_attachment_id': '3',
                   'images': [{'attachment_id': '2'}, {'attachment_id': '3'}]}
        draft = {**project, 'id': 'wp-10', 'published': 0,
                 'images': [{'id': 'already-uploaded'}]}
        calls = []
        def fake_request(url, method='GET', data=None, content_type=None):
            calls.append((url, method, data))
            if method == 'GET':
                return draft
            return {'ok': True}
        with patch.object(module, 'request', side_effect=fake_request), \
             patch.object(module, 'verify_existing', return_value=(True, '')), \
             patch.object(module, 'upload', return_value={'id': 'new-image'}) as upload:
            result = module.import_project('http://127.0.0.1:8787', project, Path('/tmp'), {'example': draft})
        self.assertEqual(result, 'imported and published')
        self.assertEqual(upload.call_count, 1)
        self.assertEqual(upload.call_args.args[2]['attachment_id'], '3')
        self.assertIn(b'new-image', next(data for url, _, data in calls if url.endswith('/cover')))

    def test_modified_existing_sample_is_not_overwritten(self):
        project = {'wordpress_id': '10', 'slug': 'example', 'title': 'Example',
                   'category': '', 'location': '', 'year': '', 'description': ''}
        existing = {'example': {'id': 'user-project'}}
        with patch.object(module, 'request', return_value={'id': 'user-project'}) as req, \
             patch.object(module, 'verify_existing', return_value=(False, 'field title differs')):
            result = module.import_project('http://127.0.0.1:8787', project, Path('/tmp'), existing)
        self.assertIn('unchanged', result)
        self.assertEqual(req.call_count, 1)


if __name__ == '__main__':
    unittest.main()
