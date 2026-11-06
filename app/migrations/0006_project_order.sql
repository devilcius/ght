ALTER TABLE projects ADD COLUMN display_order INTEGER CHECK(display_order IS NULL OR (display_order >= 1 AND display_order <= 1000000));
-- Remove only the two unchanged, image-free fictional seed records.
DELETE FROM projects
WHERE ((id='demo-1' AND title='Vivienda entre patios' AND slug='vivienda-entre-patios' AND category='Residencial' AND location='Madrid' AND year='2024' AND description='Proyecto de ejemplo para probar el editor local.')
    OR (id='demo-2' AND title='Espacios para la comunidad' AND slug='espacios-para-la-comunidad' AND category='Dotacional' AND location='Madrid' AND year='2022' AND description='Contenido de ejemplo. Sustituir durante la migración.'))
  AND NOT EXISTS (SELECT 1 FROM project_images WHERE project_images.project_id=projects.id);
