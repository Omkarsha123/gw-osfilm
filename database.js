const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'frameflow.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    location TEXT NOT NULL,
    album TEXT NOT NULL DEFAULT 'yes' CHECK (album IN ('yes', 'no')),
    active_stage INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('reel', 'full')),
    status TEXT NOT NULL DEFAULT 'Not started',
    progress INTEGER NOT NULL DEFAULT 0,
    due TEXT NOT NULL,
    assignee TEXT NOT NULL,
    person TEXT NOT NULL,
    priority TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Administrator',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_clients (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'primary',
    PRIMARY KEY (project_id, client_id)
  );
  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS workflow_stages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_type TEXT NOT NULL CHECK (workflow_type IN ('photo', 'video')),
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
    started_at TEXT,
    completed_at TEXT,
    UNIQUE (project_id, workflow_type, position)
  );
  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor_type TEXT NOT NULL CHECK (vendor_type IN ('design', 'printing', 'editing', 'backup', 'other')),
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vendor_assignments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    assignment_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    assigned_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS deliverables (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    deliverable_type TEXT NOT NULL CHECK (deliverable_type IN ('reel', 'full_video', 'album', 'photo_set', 'other')),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'backup', 'editing', 'review', 'approved', 'printing', 'delivered', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    due_at TEXT,
    assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
    vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS editor_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deliverable_assignments (
    id TEXT PRIMARY KEY,
    deliverable_id TEXT NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    editor_id TEXT NOT NULL REFERENCES editor_profiles(id) ON DELETE CASCADE,
    assignment_role TEXT NOT NULL DEFAULT 'editor',
    status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'review', 'completed')),
    assigned_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (deliverable_id, editor_id, assignment_role)
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    deliverable_id TEXT REFERENCES deliverables(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    size_bytes INTEGER,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    CHECK (task_id IS NOT NULL OR deliverable_id IS NOT NULL)
  );
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspace_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
function addColumn(table, column, definition) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch (error) { if (!error.message.includes('duplicate column')) throw error; }
}
addColumn('tasks', 'status', "TEXT NOT NULL DEFAULT 'open'");
addColumn('tasks', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
addColumn('tasks', 'due_at', 'TEXT');
addColumn('tasks', 'assigned_to', 'TEXT');
addColumn('tasks', 'completed_at', 'TEXT');
addColumn('tasks', 'updated_at', "TEXT NOT NULL DEFAULT ''");
for (const column of ['design_vendor', 'printing_vendor']) {
  try { db.exec(`ALTER TABLE projects ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`); } catch (error) { if (!error.message.includes('duplicate column')) throw error; }
}
addColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
addColumn('users', 'invited_at', 'TEXT');

const projectId = 'aria-rohan';
const now = () => new Date().toISOString();
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return key && crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@frameflow.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('admin', 'Arjun Kapoor', adminEmail, hashPassword(adminPassword), 'Administrator', now());
}
const projectExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
if (!projectExists) {
  const createdAt = now();
  const insertProject = db.prepare(`INSERT INTO projects (id, name, type, event_date, location, album, active_stage, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertVideo = db.prepare(`INSERT INTO videos (id, project_id, name, type, status, progress, due, assignee, person, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertProject.run(projectId, 'Aria & Rohan', 'Wedding production', '18 Feb 2024', 'Mumbai', 'yes', 3, "Family names to be checked before selection. Use the client's Pinterest board for the cover reference.", createdAt, createdAt);
  insertVideo.run('reel-01', projectId, 'Reel 01', 'reel', 'Editing', 75, '24 Feb', 'PS', 'Priya S.', 'High priority', createdAt);
  insertVideo.run('reel-02', projectId, 'Reel 02', 'reel', 'Data backup', 25, '26 Feb', 'RV', 'Rohan V.', null, createdAt);
  insertVideo.run('full-film', projectId, 'Full length film', 'full', 'Data backup', 25, '28 Feb', 'PS', 'Priya S.', null, createdAt);
}
const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@frameflow.local');
if (adminUser && !db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, adminUser.id)) {
  db.prepare('INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(projectId, adminUser.id, 'owner', now());
}
if (!db.prepare('SELECT id FROM clients LIMIT 1').get()) {
  const clientId = 'client-aria-rohan';
  db.prepare('INSERT INTO clients (id, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(clientId, 'Aria & Rohan', null, null, now(), now());
  db.prepare('INSERT INTO project_clients (project_id, client_id, relationship) VALUES (?, ?, ?)').run(projectId, clientId, 'primary');
}
const photoStageSeed = ['Shoot', 'Data backup', 'Album decision', 'Photo selection', 'Design vendor', 'Printing', 'Deliver'];
if (!db.prepare("SELECT id FROM workflow_stages WHERE project_id = ? LIMIT 1").get(projectId)) {
  const insertStage = db.prepare('INSERT INTO workflow_stages (id, project_id, workflow_type, name, position, status) VALUES (?, ?, ?, ?, ?, ?)');
  photoStageSeed.forEach((name, position) => insertStage.run(crypto.randomUUID(), projectId, 'photo', name, position, position < 3 ? 'completed' : position === 3 ? 'in_progress' : 'not_started'));
}
if (!db.prepare('SELECT id FROM deliverables WHERE project_id = ? LIMIT 1').get(projectId)) {
  const insertDeliverable = db.prepare('INSERT INTO deliverables (id, project_id, deliverable_type, name, status, progress, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.prepare('SELECT id, name, type, status, progress, due, created_at FROM videos WHERE project_id = ?').all(projectId).forEach((video) => {
    const statusMap = { 'Not started': 'not_started', 'Data backup': 'backup', Editing: 'editing', Review: 'review', Complete: 'delivered' };
    insertDeliverable.run(video.id, projectId, video.type === 'full' ? 'full_video' : 'reel', video.name, statusMap[video.status] || 'not_started', video.progress, video.due, video.created_at, now());
  });
}
if (!db.prepare('SELECT id FROM vendors LIMIT 1').get()) {
  const insertVendor = db.prepare('INSERT INTO vendors (id, name, vendor_type, contact_name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertVendor.run('vendor-design-default', 'Design partner', 'design', null, null, null, now(), now());
  insertVendor.run('vendor-print-default', 'Print partner', 'printing', null, null, null, now(), now());
  insertVendor.run('vendor-edit-default', 'Edit partner', 'editing', null, null, null, now(), now());
}
if (!db.prepare('SELECT id FROM editor_profiles LIMIT 1').get()) {
  const insertEditor = db.prepare('INSERT INTO editor_profiles (id, name, email, vendor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  insertEditor.run('editor-priya', 'Priya S.', null, 'vendor-edit-default', now(), now());
  insertEditor.run('editor-rohan', 'Rohan V.', null, 'vendor-edit-default', now(), now());
  insertEditor.run('editor-arjun', 'Arjun K.', null, 'vendor-edit-default', now(), now());
}
if (!db.prepare('SELECT id FROM deliverable_assignments LIMIT 1').get()) {
  const editorByName = db.prepare('SELECT id FROM editor_profiles WHERE name = ?');
  const deliverables = db.prepare('SELECT id, name FROM deliverables WHERE project_id = ?').all(projectId);
  const insertAssignment = db.prepare('INSERT OR IGNORE INTO deliverable_assignments (id, deliverable_id, editor_id, assignment_role, status, assigned_at) VALUES (?, ?, ?, ?, ?, ?)');
  deliverables.forEach((deliverable) => {
    const editor = editorByName.get(deliverable.name === 'Reel 01' || deliverable.name === 'Full length film' ? 'Priya S.' : 'Rohan V.');
    if (editor) insertAssignment.run(crypto.randomUUID(), deliverable.id, editor.id, 'editor', 'assigned', now());
  });
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status); CREATE INDEX IF NOT EXISTS idx_stages_project_type ON workflow_stages(project_id, workflow_type, position); CREATE INDEX IF NOT EXISTS idx_deliverables_project_status ON deliverables(project_id, status); CREATE INDEX IF NOT EXISTS idx_activities_project_created ON activities(project_id, created_at DESC);`);

function logActivity(projectId, actorId, action, entityType, entityId = null) {
  db.prepare('INSERT INTO activities (id, project_id, actor_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), projectId, actorId || null, action, entityType, entityId, now());
}
function listProjects() {
  const rows = db.prepare('SELECT id, name, type, event_date AS date, location, album, active_stage AS activeStage, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC').all();
  const stageCounts = { yes: photoStageSeed.length, no: 4 };
  return rows.map((row) => ({
    ...row,
    stageTotal: stageCounts[row.album] || photoStageSeed.length,
    openTasks: db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(row.id).count,
    videoCount: db.prepare('SELECT COUNT(*) AS count FROM videos WHERE project_id = ?').get(row.id).count,
  }));
}
function createProject({ name, type = 'Wedding production', date = '', location = '', album = 'yes' }, actorId = null) {
  const cleanName = String(name || '').trim();
  const cleanType = String(type || '').trim();
  const cleanDate = String(date || '').trim();
  const cleanLocation = String(location || '').trim();
  if (!cleanName || !cleanType || !cleanDate || !cleanLocation) throw new Error('Project name, type, event date, and location are required');
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID();
  const uniqueId = db.prepare('SELECT id FROM projects WHERE id = ?').get(id) ? `${id}-${crypto.randomUUID().slice(0, 6)}` : id;
  const createdAt = now();
  db.prepare('INSERT INTO projects (id, name, type, event_date, location, album, active_stage, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(uniqueId, cleanName, cleanType, cleanDate, cleanLocation, album === 'no' ? 'no' : 'yes', 0, '', createdAt, createdAt);
  const stageNames = album === 'no' ? ['Shoot', 'Data backup', 'Album decision', 'Deliver'] : photoStageSeed;
  const insertStage = db.prepare('INSERT INTO workflow_stages (id, project_id, workflow_type, name, position, status) VALUES (?, ?, ?, ?, ?, ?)');
  stageNames.forEach((stageName, position) => insertStage.run(crypto.randomUUID(), uniqueId, 'photo', stageName, position, position === 0 ? 'in_progress' : 'not_started'));
  logActivity(uniqueId, actorId, `created project "${cleanName}"`, 'project', uniqueId);
  return project(uniqueId);
}
function project(projectId) {
  const result = db.prepare('SELECT id, name, type, event_date AS date, location, album, active_stage AS activeStage, notes, design_vendor AS designVendor, printing_vendor AS printingVendor, created_at AS createdAt, updated_at AS updatedAt FROM projects WHERE id = ?').get(projectId);
  if (!result) throw new Error('Project not found');
  result.tasks = db.prepare('SELECT id, name, details, created_at AS createdAt FROM tasks WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  result.videos = db.prepare('SELECT id, name, type, status, progress, due, assignee, person, priority, created_at AS createdAt FROM videos WHERE project_id = ? ORDER BY created_at').all(projectId);
  result.workflowStages = db.prepare('SELECT id, workflow_type AS workflowType, name, position, status, started_at AS startedAt, completed_at AS completedAt FROM workflow_stages WHERE project_id = ? ORDER BY workflow_type, position').all(projectId);
  result.vendors = db.prepare('SELECT v.id, v.name, v.vendor_type AS vendorType, v.contact_name AS contactName, va.assignment_type AS assignmentType, va.status FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.project_id = ? ORDER BY v.name').all(projectId);
  result.activities = db.prepare('SELECT id, action, entity_type AS entityType, entity_id AS entityId, metadata_json AS metadata, created_at AS createdAt FROM activities WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(projectId);
  result.partners = db.prepare(`SELECT v.id, v.name, v.vendor_type AS vendorType, va.assignment_type AS assignmentType, va.status FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.project_id = ? ORDER BY v.vendor_type`).all(projectId);
  result.vendorOptions = db.prepare('SELECT id, name, vendor_type AS vendorType, contact_name AS contactName FROM vendors WHERE vendor_type IN (\'design\', \'printing\') ORDER BY vendor_type, name').all();
  result.editors = db.prepare(`SELECT d.id AS deliverableId, d.name AS deliverableName, e.id AS editorId, e.name AS editorName, da.status FROM deliverable_assignments da JOIN deliverables d ON d.id = da.deliverable_id JOIN editor_profiles e ON e.id = da.editor_id WHERE d.project_id = ? ORDER BY d.created_at`).all(projectId);
  return result;
}
function updateProject(projectId, changes, actorId = null) {
  const fields = [];
  const values = [];
  const allowed = { album: 'album', activeStage: 'active_stage', notes: 'notes', designVendor: 'design_vendor', printingVendor: 'printing_vendor' };
  Object.entries(allowed).forEach(([key, column]) => { if (changes[key] !== undefined) { fields.push(`${column} = ?`); values.push(changes[key]); } });
  if (fields.length) { fields.push('updated_at = ?'); values.push(now(), projectId); db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
  if (changes.album !== undefined) logActivity(projectId, actorId, `set album workflow to "${changes.album}"`, 'project', projectId);
  if (changes.activeStage !== undefined) logActivity(projectId, actorId, 'moved the photo flow stage', 'project', projectId);
  if (changes.notes !== undefined) logActivity(projectId, actorId, 'updated project notes', 'project', projectId);
  return project(projectId);
}
function addTask(projectId, { name, details = '' }, actorId = null) {
  const task = { id: crypto.randomUUID(), projectId, name, details, createdAt: now() };
  db.prepare('INSERT INTO tasks (id, project_id, name, details, created_at) VALUES (?, ?, ?, ?, ?)').run(task.id, task.projectId, task.name, task.details, task.createdAt);
  logActivity(projectId, actorId, `added task "${name}"`, 'task', task.id);
  return project(projectId);
}
function addVideo(projectId, { name, type = 'reel', due = '02 Mar', assignee = 'AK', person = 'Arjun K.' }, actorId = null) {
  const video = { id: crypto.randomUUID(), projectId, name, type: type === 'full' ? 'full' : 'reel', status: 'Not started', progress: 0, due, assignee, person, createdAt: now() };
  db.prepare('INSERT INTO videos (id, project_id, name, type, status, progress, due, assignee, person, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(video.id, video.projectId, video.name, video.type, video.status, video.progress, video.due, video.assignee, video.person, video.createdAt);
  logActivity(projectId, actorId, `added video deliverable "${name}"`, 'video', video.id);
  return project(projectId);
}
function removeTask(projectId, id, actorId = null) {
  const task = db.prepare('SELECT name FROM tasks WHERE id = ? AND project_id = ?').get(id, projectId);
  db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(id, projectId);
  if (task) logActivity(projectId, actorId, `removed task "${task.name}"`, 'task', id);
  return project(projectId);
}
function updateVideo(projectId, id, changes, actorId = null) {
  const allowed = ['status', 'progress'];
  const entries = Object.entries(changes).filter(([key]) => allowed.includes(key));
  if (!entries.length) return project(projectId);
  const values = entries.map(([, value]) => value);
  values.push(id, projectId);
  db.prepare(`UPDATE videos SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ? AND project_id = ?`).run(...values);
  const video = db.prepare('SELECT name, status FROM videos WHERE id = ? AND project_id = ?').get(id, projectId);
  if (video) logActivity(projectId, actorId, `moved "${video.name}" to ${video.status}`, 'video', id);
  return project(projectId);
}
function removeVideo(projectId, id, actorId = null) {
  const video = db.prepare('SELECT name FROM videos WHERE id = ? AND project_id = ?').get(id, projectId);
  db.prepare('DELETE FROM videos WHERE id = ? AND project_id = ?').run(id, projectId);
  db.prepare('DELETE FROM deliverables WHERE id = ? AND project_id = ?').run(id, projectId);
  if (video) logActivity(projectId, actorId, `removed video deliverable "${video.name}"`, 'video', id);
  return project(projectId);
}
function assignPartner(projectId, { type, name }, actorId = null) {
  const vendorType = type === 'printing' ? 'printing' : type === 'editing' ? 'editing' : 'design';
  let vendor = db.prepare('SELECT id FROM vendors WHERE name = ? AND vendor_type = ?').get(name, vendorType);
  if (!vendor) {
    vendor = { id: crypto.randomUUID() };
    db.prepare('INSERT INTO vendors (id, name, vendor_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(vendor.id, name, vendorType, now(), now());
  }
  const assignmentType = vendorType === 'printing' ? 'printing' : vendorType === 'editing' ? 'video_editing' : 'album_design';
  const existing = db.prepare('SELECT id FROM vendor_assignments WHERE project_id = ? AND assignment_type = ? AND status != ?').get(projectId, assignmentType, 'cancelled');
  if (existing) db.prepare('UPDATE vendor_assignments SET vendor_id = ?, status = ?, assigned_at = ? WHERE id = ?').run(vendor.id, 'assigned', now(), existing.id);
  else db.prepare('INSERT INTO vendor_assignments (id, project_id, vendor_id, assignment_type, status, assigned_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), projectId, vendor.id, assignmentType, 'assigned', now());
  const legacyColumn = vendorType === 'printing' ? 'printing_vendor' : 'design_vendor';
  db.prepare(`UPDATE projects SET ${legacyColumn} = ?, updated_at = ? WHERE id = ?`).run(name, now(), projectId);
  logActivity(projectId, actorId, `assigned ${name} as ${vendorType} vendor`, 'vendor', vendor.id);
  return project(projectId);
}
function assignEditor(projectId, { deliverableId, editorName }, actorId = null) {
  const deliverable = db.prepare('SELECT id FROM deliverables WHERE id = ? AND project_id = ?').get(deliverableId, projectId);
  if (!deliverable) throw new Error('Deliverable not found');
  let editor = db.prepare('SELECT id FROM editor_profiles WHERE name = ?').get(editorName);
  if (!editor) { editor = { id: crypto.randomUUID() }; db.prepare('INSERT INTO editor_profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(editor.id, editorName, now(), now()); }
  db.prepare('INSERT OR IGNORE INTO deliverable_assignments (id, deliverable_id, editor_id, assignment_role, status, assigned_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), deliverable.id, editor.id, 'editor', 'assigned', now());
  logActivity(projectId, actorId, `assigned ${editorName} as editor`, 'deliverable', deliverableId);
  return project(projectId);
}
function vendors() {
  return db.prepare('SELECT id, name, vendor_type AS vendorType, contact_name AS contactName, email, phone, notes FROM vendors ORDER BY vendor_type, name').all();
}
function addVendor({ name, vendorType, contactName = '', email = '', phone = '', notes = '' }) {
  const allowedTypes = new Set(['design', 'printing', 'editing', 'backup', 'other']);
  if (![name, vendorType, contactName, email, phone].every((value) => String(value || '').trim())) throw new Error('Vendor name, type, contact name, phone, and email are required');
  if (!allowedTypes.has(vendorType)) throw new Error('Invalid vendor type');
  const vendor = { id: crypto.randomUUID(), name: name.trim(), vendorType, contactName: contactName.trim(), email: email.trim(), phone: phone.trim(), notes: notes.trim() };
  db.prepare('INSERT INTO vendors (id, name, vendor_type, contact_name, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(vendor.id, vendor.name, vendor.vendorType, vendor.contactName, vendor.email, vendor.phone, vendor.notes, now(), now());
  return vendor;
}

const userRoles = ['Administrator', 'Manager', 'Editor', 'Viewer'];
function generateTempPassword() { return crypto.randomBytes(9).toString('base64url'); }
function users() {
  return db.prepare('SELECT id, name, email, role, status, created_at AS createdAt FROM users ORDER BY created_at').all();
}
function activeAdminCount(excludeId = null) {
  const rows = db.prepare("SELECT id FROM users WHERE role = 'Administrator' AND status = 'active'").all();
  return rows.filter((row) => row.id !== excludeId).length;
}
function inviteUser({ name, email, role = 'Editor' }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!cleanName || !cleanEmail) throw new Error('Name and email are required');
  if (!userRoles.includes(role)) throw new Error('Invalid role');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) throw new Error('A user with this email already exists');
  const tempPassword = generateTempPassword();
  const user = { id: crypto.randomUUID(), name: cleanName, email: cleanEmail, role };
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, status, invited_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name, user.email, hashPassword(tempPassword), user.role, 'invited', now(), now());
  return { ...user, status: 'invited', tempPassword };
}
function updateUser(id, { role, status }) {
  const user = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(id);
  if (!user) throw new Error('User not found');
  if (role && !userRoles.includes(role)) throw new Error('Invalid role');
  const nextRole = role || user.role;
  const nextStatus = status || user.status;
  if ((user.role === 'Administrator' && nextRole !== 'Administrator') || (user.status === 'active' && nextStatus !== 'active' && user.role === 'Administrator')) {
    if (activeAdminCount(id) < 1) throw new Error('At least one active administrator is required');
  }
  db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(nextRole, nextStatus, id);
  return db.prepare('SELECT id, name, email, role, status, created_at AS createdAt FROM users WHERE id = ?').get(id);
}
function removeUser(id) {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) throw new Error('User not found');
  if (user.role === 'Administrator' && activeAdminCount(id) < 1) throw new Error('At least one active administrator is required');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return users();
}

const defaultSettings = { studioName: 'Moonstone Studio', workspaceLabel: 'Production desk' };
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM workspace_settings').all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...defaultSettings, ...stored };
}
function updateSettings(changes) {
  const allowedKeys = ['studioName', 'workspaceLabel'];
  if (!String(changes.studioName || '').trim() || !String(changes.workspaceLabel || '').trim()) throw new Error('Studio name and workspace label are required');
  const insert = db.prepare('INSERT INTO workspace_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  allowedKeys.forEach((key) => { if (changes[key] !== undefined && String(changes[key]).trim()) insert.run(key, String(changes[key]).trim()); });
  return getSettings();
}
function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT password_hash AS passwordHash FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) throw new Error('Current password is incorrect');
  if (!newPassword || newPassword.length < 8) throw new Error('New password must be at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
}

function userByEmail(email) { return db.prepare('SELECT id, name, email, password_hash AS passwordHash, role, status FROM users WHERE email = ?').get(email.toLowerCase()); }
function userById(id) { return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id); }
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(token, userId, expiresAt, now());
  return { token, expiresAt };
}
function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token = ?').get(token);
  if (!row || new Date(row.expiresAt) <= new Date()) { if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(token); return null; }
  return userById(row.userId);
}
function deleteSession(token) { if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token); }
module.exports = { project, updateProject, addTask, removeTask, addVideo, updateVideo, removeVideo, assignPartner, assignEditor, listProjects, createProject, vendors, addVendor, users, inviteUser, updateUser, removeUser, getSettings, updateSettings, changePassword, userByEmail, verifyPassword, createSession, sessionUser, deleteSession };
