const isOfflineMode = window.location.protocol === 'file:';
const settingsForm = document.getElementById('settingsForm');

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
mobileMenu.innerHTML = '<a href="projects.html">All projects</a><a href="vendors.html">Vendors</a><a href="team.html">Users</a><a href="profile.html">Profile</a>';
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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !mobileMenu.hidden) closeMobileMenu(); });

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2600);
}
async function loadSettings() {
  if (isOfflineMode) { document.getElementById('studioNameInput').value = 'Moonstone Studio'; document.getElementById('workspaceLabelInput').value = 'Production desk'; return; }
  const session = await fetch('/api/auth/me').then((response) => response.json());
  if (!session.authenticated) { window.location.href = 'index.html'; return; }
  document.getElementById('accountInitials').textContent = session.user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('accountName').textContent = session.user.name;
  document.getElementById('accountEmail').textContent = session.user.email;
  document.getElementById('accountRole').textContent = session.user.role;
  const settings = await fetch('/api/settings').then((response) => response.json());
  document.getElementById('studioNameInput').value = settings.studioName;
  document.getElementById('workspaceLabelInput').value = settings.workspaceLabel;
  document.getElementById('workspaceStudioName').textContent = settings.studioName;
  document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
}
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isOfflineMode) { showToast('Settings are only saved when running through the local server'); return; }
  const changes = Object.fromEntries(new FormData(settingsForm).entries());
  const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
  if (!response.ok) { showToast('Could not save settings'); return; }
  const settings = await response.json();
  document.getElementById('workspaceStudioName').textContent = settings.studioName;
  document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
  showToast('Settings saved');
});
loadSettings().catch(() => showToast('Could not load settings'));
