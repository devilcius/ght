import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('archive_submissions', Path(__file__).resolve().parents[1] / 'scripts' / 'archive_submissions.py')
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def insert(table, fields):
    def quote(value):
        return 'NULL' if value is None else "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"
    return f'INSERT INTO `wq5aC_{table}` VALUES (' + ','.join(quote(v) for v in fields) + ');\n'


class ArchiveTests(unittest.TestCase):
    def test_preserves_values_relationships_and_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            submission = [''] * len(archive.TABLES['e_submissions'])
            submission[0], submission[18], submission[19] = '1', '2025-01-01', '2025-01-01'
            values = ['2', '1', 'message', "O'Brien,\nhello\\world"]
            log = ['3', '1', 'email', 'Email', 'success', None, '', '', '', '']
            dump = root / 'source.sql'
            dump.write_text(insert('e_submissions', submission) + insert('e_submissions_values', values) + insert('e_submissions_actions_log', log), encoding='utf-8')
            output = root / 'archive'
            result = archive.write_archive(dump, output)
            target = Path(result['archive'])
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            with sqlite3.connect(target) as conn:
                self.assertEqual(conn.execute('SELECT * FROM e_submissions_values').fetchone(), tuple(values))
                self.assertIsNone(conn.execute('SELECT log FROM e_submissions_actions_log').fetchone()[0])
            with self.assertRaises(FileExistsError):
                archive.write_archive(dump, output)
            self.assertTrue(target.exists())

    def test_orphan_causes_failure_without_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dump = root / 'source.sql'
            dump.write_text(insert('e_submissions_values', ['2', '99', 'email', 'example']), encoding='utf-8')
            with self.assertRaises(ValueError):
                archive.write_archive(dump, root / 'archive')
            self.assertEqual(list((root / 'archive').iterdir()), [])

    def test_null_and_literal_null_are_distinct(self):
        source = "INSERT INTO `wq5aC_e_submissions_values` VALUES (1,2,'NULL',NULL);"
        self.assertEqual(list(archive.rows(source, 'e_submissions_values')), [['1', '2', 'NULL', None]])


if __name__ == '__main__':
    unittest.main()
