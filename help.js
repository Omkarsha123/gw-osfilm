const isOfflineMode = window.location.protocol === 'file:';
if (isOfflineMode && localStorage.getItem('frameflow-local-session') !== 'active') window.location.href = 'index.html';

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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !mobileMenu.hidden) closeMobileMenu(); });

async function applyWorkspaceSettings() {
  if (isOfflineMode) return;
  try {
    const settings = await fetch('/api/settings').then((response) => response.json());
    document.getElementById('workspaceStudioName').textContent = settings.studioName;
    document.getElementById('workspaceLabelText').textContent = settings.workspaceLabel;
  } catch { /* keep defaults */ }
}
applyWorkspaceSettings();
