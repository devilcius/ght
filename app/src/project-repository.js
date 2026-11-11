export const findProject = (db, id) => db.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();
export const findImage = (db, imageId, projectId) => db.prepare('SELECT * FROM project_images WHERE id=? AND project_id=?').bind(imageId, projectId).first();
export const imageExists = (db, imageId, projectId) => db.prepare('SELECT id FROM project_images WHERE id=? AND project_id=?').bind(imageId, projectId).first();
export const pendingDeletion = (db, key) => db.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(key);
export const clearPendingDeletion = (db, key) => db.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(key).run();

export function createProject(db, id, project, now, displayOrder, categoryOrder) {
  return db.prepare('INSERT INTO projects (id,title,slug,category,location,year,description,published,created_at,updated_at,display_order,category_display_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,project.title,project.slug,project.category,project.location,project.year,project.description,project.published,now,now,displayOrder,categoryOrder).run();
}

export function updateProject(db, id, project, displayOrder, categoryOrder) {
  return db.prepare('UPDATE projects SET title=?,slug=?,category=?,location=?,year=?,description=?,published=?,updated_at=?,display_order=?,category_display_order=? WHERE id=?')
    .bind(project.title,project.slug,project.category,project.location,project.year,project.description,project.published,new Date().toISOString(),displayOrder,categoryOrder,id).run();
}

export const setThumbnail = (db, key, imageId, projectId) => db.prepare('UPDATE project_images SET thumbnail_key=? WHERE id=? AND project_id=?').bind(key,imageId,projectId);
export const updateAlt = (db, alt, imageId, projectId) => db.prepare('UPDATE project_images SET alt=? WHERE id=? AND project_id=?').bind(alt,imageId,projectId).run();
export const clearCover = (db, projectId, imageId) => db.prepare('UPDATE projects SET cover_image_id=NULL WHERE id=? AND cover_image_id=?').bind(projectId,imageId);
export const deleteImage = (db, imageId, projectId) => db.prepare('DELETE FROM project_images WHERE id=? AND project_id=?').bind(imageId,projectId);
export const setCover = (db, imageId, projectId) => db.prepare('UPDATE projects SET cover_image_id=? WHERE id=?').bind(imageId,projectId).run();
export const imageIds = async (db, projectId) => (await db.prepare('SELECT id FROM project_images WHERE project_id=?').bind(projectId).all()).results.map(image => image.id);
export const setImagePosition = (db, position, imageId, projectId) => db.prepare('UPDATE project_images SET position=? WHERE id=? AND project_id=?').bind(position,imageId,projectId);

export function insertImage(db, imageId, projectId, key, alt) {
  return db.prepare('INSERT INTO project_images (id,project_id,object_key,alt,position) VALUES (?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM project_images WHERE project_id=?))')
    .bind(imageId,projectId,key,alt,projectId).run();
}
