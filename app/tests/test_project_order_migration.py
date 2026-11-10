import sqlite3
import unittest
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / 'migrations'


class ProjectOrderMigrationTests(unittest.TestCase):
    def test_legacy_orders_are_independent_and_existing_order_is_preserved(self):
        with sqlite3.connect(':memory:') as db:
            for migration in sorted(MIGRATIONS.glob('*.sql')):
                if migration.name.startswith('0009'):
                    break
                db.executescript(migration.read_text())
            values = [
                ('colmenar','76-viv-colmenar-viejo-jovILma'.lower(),'Residencial colectivo',None),
                ('valdebebas','107-viv-valdebebas-criteria-caixa','Residencial colectivo',None),
                ('manual','136-viv-tres-cantos-inmocaixa','Residencial colectivo',99),
                ('vejer','ordenacion-urbanistica-vejer-de-la-frontera-concurso-accesit','Dotacional',None),
                ('extra','not-in-legacy-panel','Dotacional',None),
            ]
            db.executemany('INSERT INTO projects (id,title,slug,category,created_at,updated_at,display_order) VALUES (?,?,?,?,?,?,?)',[(i,i,slug,category,'2026','2026',pos) for i,slug,category,pos in values])
            db.executescript((MIGRATIONS/'0009_restore_project_order.sql').read_text())
            positions = {row[0]:row[1:] for row in db.execute('SELECT id,display_order,category_display_order FROM projects')}
            self.assertLess(positions['colmenar'][0], positions['valdebebas'][0])
            self.assertGreater(positions['colmenar'][1], positions['valdebebas'][1])
            self.assertEqual(positions['manual'][0],99)
            self.assertEqual(positions['manual'][1],1)
            self.assertIsNone(positions['vejer'][1])
            self.assertEqual(positions['extra'],(None,None))


if __name__ == '__main__':
    unittest.main()
