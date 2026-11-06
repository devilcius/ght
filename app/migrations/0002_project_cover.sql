ALTER TABLE projects ADD COLUMN cover_image_id TEXT REFERENCES project_images(id) ON DELETE SET NULL;
