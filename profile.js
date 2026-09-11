const isOfflineMode = window.location.protocol === 'file:';
const passwordForm = document.getElementById('passwordForm');

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
mobileMenu.innerHTML = '<a href="projects.html">All projects</a><a href="vendors.html">Vendors</a><a href="team.html">Users</a><a href="settings.html">Settings</a>';
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
async function loadProfile() {
  if (isOfflineMode) { document.getElementById('profileName').textContent = 'Offline mode'; document.getElementById('profileMeta').textContent = 'Sign in through the local server to manage your account.'; passwordForm.querySelector('button').disabled = true; return; }
  const session = await fetch('/api/auth/me').then((response) => response.json());
  if (!session.authenticated) { window.location.href = 'index.html'; return; }
  const initials = session.user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('profileName').textContent = session.user.name;
  document.getElementById('profileMeta').textContent = `${session.user.role} · ${session.user.email}`;
  document.getElementById('profileInitials').textContent = initials;
  document.getElementById('profileEmail').textContent = session.user.email;
  document.getElementById('profileRole').textContent = session.user.role;
  const settings = await fetch('/api/settings').then((response) => response.json());
  document.getElementById('workspaceStudioName').textContent = settings.studioName;
  document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
}
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { currentPassword, newPassword, confirmPassword } = Object.fromEntries(new FormData(passwordForm).entries());
  if (newPassword !== confirmPassword) { showToast('New password and confirmation do not match'); return; }
  const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
  const result = await response.json();
  if (!response.ok) { showToast(result.error || 'Could not update password'); return; }
  passwordForm.reset();
  showToast('Password updated');
});
document.getElementById('logoutBtn').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = 'index.html'; });
loadProfile().catch(() => showToast('Could not load your profile'));
