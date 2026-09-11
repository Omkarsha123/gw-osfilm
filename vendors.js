const offlineKey = 'frameflow-vendor-registry';
const isOfflineMode = window.location.protocol === 'file:';
const initialVendors = [
  { id: 'vendor-design-default', name: 'Design partner', vendorType: 'design', contactName: '', email: '', phone: '', notes: '' },
  { id: 'vendor-print-default', name: 'Print partner', vendorType: 'printing', contactName: '', email: '', phone: '', notes: '' },
  { id: 'vendor-edit-default', name: 'Edit partner', vendorType: 'editing', contactName: '', email: '', phone: '', notes: '' },
];
let vendors = JSON.parse(localStorage.getItem(offlineKey) || 'null') || initialVendors;

const typeLabels = { design: 'Album design', printing: 'Printing', editing: 'Video editing', backup: 'Data backup', other: 'Other' };
const vendorList = document.getElementById('vendorList');
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
document.getElementById('settingsBtn').addEventListener('click', () => { window.location.href = 'settings.html'; });
document.getElementById('helpBtn').addEventListener('click', () => { window.location.href = 'help.html'; });
document.getElementById('profileBtn').addEventListener('click', () => { window.location.href = 'profile.html'; });
function saveOfflineVendors() { localStorage.setItem(offlineKey, JSON.stringify(vendors)); }
function renderVendors() {
  document.getElementById('vendorCount').textContent = `${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'}`;
  vendorList.innerHTML = vendors.length ? vendors.map((vendor) => `<article class="vendor-row"><div class="vendor-badge ${vendor.vendorType}" aria-hidden="true">${vendor.name.slice(0, 1).toUpperCase()}</div><div class="vendor-main"><strong>${vendor.name}</strong><span>${typeLabels[vendor.vendorType] || 'Other'}${vendor.contactName ? ` · ${vendor.contactName}` : ''}</span>${vendor.notes ? `<small>${vendor.notes}</small>` : ''}</div><div class="vendor-contact">${vendor.email ? `<a href="mailto:${vendor.email}">${vendor.email}</a>` : ''}${vendor.phone ? `<span>${vendor.phone}</span>` : ''}</div></article>`).join('') : '<p class="registry-empty">No vendors registered yet.</p>';
}
async function loadVendors() {
  if (isOfflineMode) { renderVendors(); return; }
  const session = await fetch('/api/auth/me').then((response) => response.json());
  if (!session.authenticated) { window.location.href = 'index.html'; return; }
  applyCurrentUser(session.user);
  await applyWorkspaceSettings();
  const response = await fetch('/api/vendors');
  if (!response.ok) throw new Error('Could not load vendors');
  vendors = await response.json();
  renderVendors();
}
document.getElementById('vendorForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const vendorForm = event.currentTarget;
  const form = new FormData(vendorForm);
  const vendor = Object.fromEntries(form.entries());
  if (isOfflineMode) {
    vendors.push({ id: crypto.randomUUID(), ...vendor });
    saveOfflineVendors();
  } else {
    const response = await fetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vendor) });
    if (!response.ok) { showToast('Vendor registration failed'); return; }
    vendors.push(await response.json());
  }
  vendorForm.reset();
  renderVendors();
  showToast(`${vendor.name} registered`);
});
loadVendors().catch(() => showToast('Could not load the vendor directory'));