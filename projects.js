const isOfflineMode = window.location.protocol === 'file:';
let projects = [];
let searchTerm = '';

const projectGrid = document.getElementById('projectGrid');
const newProjectBackdrop = document.getElementById('newProjectBackdrop');
const newProjectForm = document.getElementById('newProjectForm');
let lastFocusedElement = null;
let selectedAlbum = 'yes';

const mobileMenuButton = document.createElement('button');
mobileMenuButton.className = 'mobile-menu-button';
mobileMenuButton.type = 'button';
mobileMenuButton.setAttribute('aria-label', 'Open navigation menu');
mobileMenuButton.setAttribute('aria-expanded', 'false');
mobileMenuButton.innerHTML = '<span></span><span></span><span></span>';
const mobileMenu = document.createElement('nav');
mobileMenu.className = 'mobile-menu';
mobileMenu.hidden = true;
mobileMenu.setAttribute('aria-label', 'Mobile navigation');
mobileMenu.innerHTML = '<a href="projects.html">All projects</a><a href="vendors.html">Vendors</a><a href="team.html">Users</a>';
document.querySelector('.topbar').prepend(mobileMenuButton);
document.querySelector('.topbar').after(mobileMenu);
function closeMobileMenu() {
  mobileMenu.hidden = true;
  mobileMenuButton.setAttribute('aria-expanded', 'false');
  mobileMenuButton.setAttribute('aria-label', 'Open navigation menu');
}
mobileMenuButton.addEventListener('click', () => {
  const willOpen = mobileMenu.hidden;
  mobileMenu.hidden = !willOpen;
  mobileMenuButton.setAttribute('aria-expanded', String(willOpen));
  mobileMenuButton.setAttribute('aria-label', `${willOpen ? 'Close' : 'Open'} navigation menu`);
});
mobileMenu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu));

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2600);
}
async function applyWorkspaceSettings() {
  if (isOfflineMode) return;
  try {
    const settings = await fetch('/api/settings').then((response) => response.json());
    document.getElementById('workspaceStudioName').textContent = settings.studioName;
    document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
  } catch { /* keep defaults */ }
}
function applyCurrentUser(user) {
  if (!user) return;
  const initials = user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('sidebarUserAvatar').textContent = initials;
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarUserRole').textContent = user.role;
}
function visibleProjects() {
  const term = searchTerm.trim().toLowerCase();
  return projects.filter((project) => !term || `${project.name} ${project.location} ${project.type}`.toLowerCase().includes(term));
}
function renderProjects() {
  const rows = visibleProjects();
  projectGrid.innerHTML = rows.length ? rows.map((project) => {
    const pct = project.stageTotal ? Math.round((Math.min(project.activeStage, project.stageTotal) / project.stageTotal) * 100) : 0;
    return `<a class="project-card" href="index.html?id=${encodeURIComponent(project.id)}">
      <div class="project-card-head"><strong>${project.name}</strong><span class="project-card-type">${project.type || 'Production'}</span></div>
      <p class="project-card-meta">${project.date || 'Date TBC'} <span class="bullet">•</span> ${project.location || 'Location TBC'}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <div class="project-card-foot"><span>${pct}% complete</span><span>${project.openTasks} open task${project.openTasks === 1 ? '' : 's'}</span><span>${project.videoCount} video${project.videoCount === 1 ? '' : 's'}</span></div>
    </a>`;
  }).join('') : '<p class="registry-empty">No projects match this search. Create a new project to get started.</p>';
}
async function loadProjects() {
  if (isOfflineMode) {
    if (localStorage.getItem('frameflow-local-session') !== 'active') { window.location.href = 'index.html'; return; }
    projectGrid.innerHTML = '<p class="registry-empty">Project management is available when connected to the local server.</p>';
    return;
  }
  const session = await fetch('/api/auth/me').then((response) => response.json());
  if (!session.authenticated) { window.location.href = 'index.html'; return; }
  applyCurrentUser(session.user);
  await applyWorkspaceSettings();
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  projects = await response.json();
  renderProjects();
}
function openNewProjectModal() {
  lastFocusedElement = document.activeElement;
  newProjectBackdrop.hidden = false;
  document.getElementById('projectNameInput').focus();
}
function closeNewProjectModal() { newProjectBackdrop.hidden = true; newProjectForm.reset(); selectedAlbum = 'yes'; document.getElementById('projectAlbumInput').value = 'yes'; lastFocusedElement?.focus(); }
document.getElementById('newProjectBtn').addEventListener('click', openNewProjectModal);
document.getElementById('newProjectClose').addEventListener('click', closeNewProjectModal);
document.getElementById('newProjectCancel').addEventListener('click', closeNewProjectModal);
newProjectBackdrop.addEventListener('click', (event) => { if (event.target === newProjectBackdrop) closeNewProjectModal(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileMenu.hidden) closeMobileMenu();
  if (event.key === 'Escape' && !newProjectBackdrop.hidden) closeNewProjectModal();
});
document.querySelectorAll('#newProjectAlbumGroup [data-album]').forEach((button) => button.addEventListener('click', () => {
  selectedAlbum = button.dataset.album;
  document.getElementById('projectAlbumInput').value = selectedAlbum;
  document.querySelectorAll('#newProjectAlbumGroup [data-album]').forEach((item) => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
}));
newProjectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const project = Object.fromEntries(new FormData(newProjectForm).entries());
  const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
  const result = await response.json();
  if (!response.ok) { showToast(result.error || 'Could not create project'); return; }
  window.location.href = `index.html?id=${encodeURIComponent(result.id)}`;
});
document.getElementById('projectSearch').addEventListener('input', (event) => { searchTerm = event.target.value; renderProjects(); });
document.getElementById('settingsBtn').addEventListener('click', () => { window.location.href = 'settings.html'; });
document.getElementById('helpBtn').addEventListener('click', () => { window.location.href = 'help.html'; });
document.getElementById('profileBtn').addEventListener('click', () => { window.location.href = 'profile.html'; });
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (isOfflineMode) { localStorage.removeItem('frameflow-local-session'); window.location.href = 'index.html'; return; }
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Logout failed');
    window.location.href = 'index.html';
  } catch { showToast('Could not sign out. Check that the server is running.'); }
});
loadProjects().catch(() => showToast('Could not load your projects'));
