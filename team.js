const isOfflineMode = window.location.protocol === 'file:';
const offlineKey = 'frameflow-team-directory';
const initialUsers = [
  { id: 'admin', name: 'Arjun Kapoor', email: 'admin@frameflow.local', role: 'Administrator', status: 'active' },
];
let users = JSON.parse(localStorage.getItem(offlineKey) || 'null') || initialUsers;
let currentUserId = 'admin';
let activeRoleFilter = 'all';
let searchTerm = '';

const userTable = document.getElementById('userTable');
const inviteModalBackdrop = document.getElementById('inviteModalBackdrop');
const inviteForm = document.getElementById('inviteForm');
let lastFocusedElement = null;

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
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 3600);
}
async function applyWorkspaceSettings() {
  if (isOfflineMode) return;
  try {
    const settings = await fetch('/api/settings').then((response) => response.json());
    document.getElementById('workspaceStudioName').textContent = settings.studioName;
    document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
  } catch { /* keep defaults */ }
}
function applySidebarUser(user) {
  if (!user) return;
  const initials = user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('sidebarUserAvatar').textContent = initials;
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarUserRole').textContent = user.role;
}
document.getElementById('settingsBtn').addEventListener('click', () => { window.location.href = 'settings.html'; });
document.getElementById('helpBtn').addEventListener('click', () => { window.location.href = 'help.html'; });
document.getElementById('profileBtn').addEventListener('click', () => { window.location.href = 'profile.html'; });
function saveOfflineUsers() { localStorage.setItem(offlineKey, JSON.stringify(users)); }
function initialsOf(name) { return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }

function renderStats() {
  document.getElementById('statTotal').textContent = users.length;
  document.getElementById('statActive').textContent = users.filter((user) => user.status === 'active').length;
  document.getElementById('statInvited').textContent = users.filter((user) => user.status === 'invited').length;
  document.getElementById('statAdmins').textContent = users.filter((user) => user.role === 'Administrator').length;
}
function visibleUsers() {
  const term = searchTerm.trim().toLowerCase();
  return users.filter((user) => (activeRoleFilter === 'all' || user.role === activeRoleFilter) && (!term || `${user.name} ${user.email}`.toLowerCase().includes(term)));
}
function renderUsers() {
  renderStats();
  const rows = visibleUsers();
  userTable.innerHTML = rows.length ? rows.map((user) => {
    const isSelf = user.id === currentUserId;
    return `<div class="team-row" data-user-id="${user.id}">
      <div class="team-user"><span class="team-avatar" aria-hidden="true">${initialsOf(user.name)}</span><div><strong>${user.name}${isSelf ? ' <em>(you)</em>' : ''}</strong><small>${user.email}</small></div></div>
      <div><select class="role-select" data-role-for="${user.id}" ${isSelf ? 'disabled' : ''} aria-label="Role for ${user.name}">
        ${['Administrator', 'Manager', 'Editor', 'Viewer'].map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${role}</option>`).join('')}
      </select></div>
      <div><span class="status-pill ${user.status}">${user.status === 'active' ? 'Active' : 'Invited'}</span></div>
      <div class="team-actions">
        <button class="text-action" data-toggle-status="${user.id}" ${isSelf ? 'disabled' : ''}>${user.status === 'active' ? 'Deactivate' : 'Activate'}</button>
        <button class="text-action danger" data-remove-user="${user.id}" ${isSelf ? 'disabled' : ''}>Remove</button>
      </div>
    </div>`;
  }).join('') : '<p class="registry-empty">No users match this view.</p>';
  bindRowEvents();
}
function bindRowEvents() {
  userTable.querySelectorAll('[data-role-for]').forEach((select) => select.addEventListener('change', () => updateUser(select.dataset.roleFor, { role: select.value })));
  userTable.querySelectorAll('[data-toggle-status]').forEach((button) => button.addEventListener('click', () => {
    const user = users.find((item) => item.id === button.dataset.toggleStatus);
    updateUser(user.id, { status: user.status === 'active' ? 'inactive' : 'active' });
  }));
  userTable.querySelectorAll('[data-remove-user]').forEach((button) => button.addEventListener('click', () => {
    const user = users.find((item) => item.id === button.dataset.removeUser);
    if (window.confirm(`Remove ${user.name} from this workspace?`)) removeUser(user.id);
  }));
}
async function updateUser(id, changes) {
  if (isOfflineMode) {
    const user = users.find((item) => item.id === id);
    Object.assign(user, changes);
    saveOfflineUsers();
    renderUsers();
    showToast('User updated');
    return;
  }
  const response = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
  const result = await response.json();
  if (!response.ok) { showToast(result.error || 'Update failed'); renderUsers(); return; }
  users = users.map((user) => (user.id === id ? { ...user, ...result } : user));
  renderUsers();
  showToast('User updated');
}
async function removeUser(id) {
  if (isOfflineMode) {
    users = users.filter((user) => user.id !== id);
    saveOfflineUsers();
    renderUsers();
    showToast('User removed');
    return;
  }
  const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) { showToast(result.error || 'Could not remove user'); return; }
  users = result;
  renderUsers();
  showToast('User removed');
}
function openInviteModal() {
  lastFocusedElement = document.activeElement;
  inviteModalBackdrop.hidden = false;
  document.getElementById('inviteName').focus();
}
function closeInviteModal() { inviteModalBackdrop.hidden = true; inviteForm.reset(); lastFocusedElement?.focus(); }
document.getElementById('inviteUserBtn').addEventListener('click', openInviteModal);
document.getElementById('inviteModalClose').addEventListener('click', closeInviteModal);
document.getElementById('inviteModalCancel').addEventListener('click', closeInviteModal);
inviteModalBackdrop.addEventListener('click', (event) => { if (event.target === inviteModalBackdrop) closeInviteModal(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileMenu.hidden) closeMobileMenu();
  if (event.key === 'Escape' && !inviteModalBackdrop.hidden) closeInviteModal();
});
inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const invite = Object.fromEntries(new FormData(inviteForm).entries());
  if (isOfflineMode) {
    users.push({ id: crypto.randomUUID(), ...invite, status: 'invited' });
    saveOfflineUsers();
    closeInviteModal();
    renderUsers();
    showToast(`${invite.name} invited`);
    return;
  }
  const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invite) });
  const result = await response.json();
  if (!response.ok) { showToast(result.error || 'Invite failed'); return; }
  users.push(result);
  closeInviteModal();
  renderUsers();
  showToast(`${invite.name} invited. Temporary password: ${result.tempPassword}`);
});
document.getElementById('userSearch').addEventListener('input', (event) => { searchTerm = event.target.value; renderUsers(); });
document.querySelectorAll('[data-role-filter]').forEach((chip) => chip.addEventListener('click', () => {
  activeRoleFilter = chip.dataset.roleFilter;
  document.querySelectorAll('[data-role-filter]').forEach((item) => item.classList.toggle('selected', item === chip));
  renderUsers();
}));
async function loadUsers() {
  if (isOfflineMode) { renderUsers(); return; }
  const session = await fetch('/api/auth/me').then((response) => response.json());
  if (!session.authenticated) { window.location.href = 'index.html'; return; }
  currentUserId = session.user.id;
  applySidebarUser(session.user);
  await applyWorkspaceSettings();
  const response = await fetch('/api/users');
  if (!response.ok) throw new Error('Could not load users');
  users = await response.json();
  renderUsers();
}
loadUsers().catch(() => showToast('Could not load the user directory'));
