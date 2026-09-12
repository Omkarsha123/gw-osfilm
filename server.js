const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const database = require('./database');

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const projectEventClients = new Map();

function broadcastProjectUpdate(projectId) {
  const clients = projectEventClients.get(projectId) || [];
  const message = `event: project-updated\ndata: ${JSON.stringify({ projectId })}\n\n`;
  clients.forEach((client) => client.write(message));
}

function removeProjectEventClient(projectId, response) {
  const clients = projectEventClients.get(projectId) || [];
  const remaining = clients.filter((client) => client !== response);
  if (remaining.length) projectEventClients.set(projectId, remaining);
  else projectEventClients.delete(projectId);
}

function send(response, status, body, contentType = 'application/json') {
  response.writeHead(status, {
    'Content-Type': `${contentType}; charset=utf-8`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Set-Cookie': response.sessionCookie || ''
  });
  response.end(contentType === 'application/json' ? JSON.stringify(body) : body);
}
function cookieValue(request, name) {
  const cookies = request.headers.cookie || '';
  return cookies.split(';').map((item) => item.trim().split('=')).find(([key]) => key === name)?.[1] || null;
}
function requireUser(request, response) {
  const user = database.sessionUser(cookieValue(request, 'frameflow_session'));
  if (!user) { send(response, 401, { error: 'Login required' }); return null; }
  return user;
}
function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) request.destroy(); });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}
function serveStatic(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(response, 404, { error: 'Not found' });
  if (path.extname(file) === '.html' && path.basename(file) !== 'index.html' && !database.sessionUser(cookieValue(request, 'frameflow_session'))) {
    response.writeHead(302, { Location: '/' });
    return response.end();
  }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  send(response, 200, fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, '');
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/api/health') return send(response, 200, { ok: true, service: 'frameflow-api', database: 'sqlite' });
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      const user = database.sessionUser(cookieValue(request, 'frameflow_session'));
      return send(response, 200, { authenticated: Boolean(user), user });
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await parseBody(request);
      const user = database.userByEmail(String(body.email || '').trim());
      if (!user || !database.verifyPassword(String(body.password || ''), user.passwordHash)) return send(response, 401, { error: 'Invalid email or password' });
      if (user.status && user.status !== 'active') return send(response, 401, { error: 'This account is not active. Contact an administrator.' });
      const session = database.createSession(user.id);
      const secureCookie = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
      response.sessionCookie = `frameflow_session=${session.token}; HttpOnly; SameSite=Lax;${secureCookie} Path=/; Max-Age=43200`;
      return send(response, 200, { authenticated: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      database.deleteSession(cookieValue(request, 'frameflow_session'));
      const secureCookie = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
      response.sessionCookie = `frameflow_session=; HttpOnly; SameSite=Lax;${secureCookie} Path=/; Max-Age=0`;
      return send(response, 200, { authenticated: false });
    }
    if (url.pathname.startsWith('/api/vendors') && !requireUser(request, response)) return;
    if (url.pathname === '/api/vendors' && request.method === 'GET') return send(response, 200, database.vendors());
    if (url.pathname === '/api/vendors' && request.method === 'POST') {
      const body = await parseBody(request);
      try { return send(response, 201, database.addVendor(body)); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    if (url.pathname.startsWith('/api/users') && !requireUser(request, response)) return;
    if (url.pathname === '/api/users' && request.method === 'GET') return send(response, 200, database.users());
    if (url.pathname === '/api/users' && request.method === 'POST') {
      const body = await parseBody(request);
      try { return send(response, 201, database.inviteUser(body)); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && request.method === 'PATCH') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      if (userMatch[1] === currentUser.id && body.status && body.status !== 'active') return send(response, 400, { error: 'You cannot deactivate your own account' });
      try { return send(response, 200, database.updateUser(userMatch[1], body)); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    if (userMatch && request.method === 'DELETE') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      if (userMatch[1] === currentUser.id) return send(response, 400, { error: 'You cannot remove your own account' });
      try { return send(response, 200, database.removeUser(userMatch[1])); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    if (url.pathname === '/api/settings' && !requireUser(request, response)) return;
    if (url.pathname === '/api/settings' && request.method === 'GET') return send(response, 200, database.getSettings());
    if (url.pathname === '/api/settings' && request.method === 'PUT') {
      try { return send(response, 200, database.updateSettings(await parseBody(request))); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    if (url.pathname === '/api/auth/password' && request.method === 'POST') {
      const currentUser = requireUser(request, response);
      if (!currentUser) return;
      const body = await parseBody(request);
      try { database.changePassword(currentUser.id, String(body.currentPassword || ''), String(body.newPassword || '')); return send(response, 200, { ok: true }); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    if (url.pathname.startsWith('/api/projects') && !requireUser(request, response)) return;
    if (url.pathname === '/api/projects' && request.method === 'GET') return send(response, 200, database.listProjects());
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      try { return send(response, 201, database.createProject(body, currentUser.id)); }
      catch (error) { return send(response, 400, { error: error.message }); }
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    const projectEventsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/events$/);
    if (projectEventsMatch && request.method === 'GET') {
      if (!requireUser(request, response)) return;
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      response.write(': connected\n\n');
      const projectId = projectEventsMatch[1];
      const clients = projectEventClients.get(projectId) || [];
      clients.push(response);
      projectEventClients.set(projectId, clients);
      const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25_000);
      request.on('close', () => {
        clearInterval(heartbeat);
        removeProjectEventClient(projectId, response);
      });
      return;
    }
    if (projectMatch && request.method === 'GET') {
      try { return send(response, 200, database.project(projectMatch[1])); }
      catch (error) { return send(response, 404, { error: error.message }); }
    }
    if (projectMatch && request.method === 'PUT') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const project = database.updateProject(projectMatch[1], await parseBody(request), currentUser.id);
      broadcastProjectUpdate(projectMatch[1]);
      return send(response, 200, project);
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
    if (tasksMatch && request.method === 'POST') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      if (!body.name) return send(response, 400, { error: 'Task name is required' });
      const project = database.addTask(tasksMatch[1], body, currentUser.id);
      broadcastProjectUpdate(tasksMatch[1]);
      return send(response, 201, project);
    }
    const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === 'DELETE') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const project = database.removeTask(taskMatch[1], taskMatch[2], currentUser.id);
      broadcastProjectUpdate(taskMatch[1]);
      return send(response, 200, project);
    }
    const videosMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/videos$/);
    if (videosMatch && request.method === 'POST') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      if (!body.name) return send(response, 400, { error: 'Deliverable name is required' });
      const project = database.addVideo(videosMatch[1], body, currentUser.id);
      broadcastProjectUpdate(videosMatch[1]);
      return send(response, 201, project);
    }
    const partnersMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/partners$/);
    if (partnersMatch && request.method === 'POST') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      if (!body.name || !body.type) return send(response, 400, { error: 'Partner type and name are required' });
      const project = database.assignPartner(partnersMatch[1], body, currentUser.id);
      broadcastProjectUpdate(partnersMatch[1]);
      return send(response, 201, project);
    }
    const editorsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/editors$/);
    if (editorsMatch && request.method === 'POST') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const body = await parseBody(request);
      if (!body.deliverableId || !body.editorName) return send(response, 400, { error: 'Deliverable and editor are required' });
      const project = database.assignEditor(editorsMatch[1], body, currentUser.id);
      broadcastProjectUpdate(editorsMatch[1]);
      return send(response, 201, project);
    }
    const videoMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/videos\/([^/]+)$/);
    if (videoMatch && request.method === 'PATCH') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const project = database.updateVideo(videoMatch[1], videoMatch[2], await parseBody(request), currentUser.id);
      broadcastProjectUpdate(videoMatch[1]);
      return send(response, 200, project);
    }
    if (videoMatch && request.method === 'DELETE') {
      const currentUser = database.sessionUser(cookieValue(request, 'frameflow_session'));
      const project = database.removeVideo(videoMatch[1], videoMatch[2], currentUser.id);
      broadcastProjectUpdate(videoMatch[1]);
      return send(response, 200, project);
    }
    if (url.pathname.startsWith('/api/')) return send(response, 404, { error: 'API route not found' });
    return serveStatic(request, response);
  } catch (error) { return send(response, 500, { error: error.message }); }
});

server.listen(port, () => console.log(`Frameflow running at http://localhost:${port}`));
