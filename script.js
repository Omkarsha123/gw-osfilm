const urlParams = new URLSearchParams(window.location.search);
const currentProjectId = urlParams.get('id');
const isOfflineMode = window.location.protocol === 'file:';
const stateKey = `frameflow-project-${currentProjectId || 'demo'}`;
const defaultState = {
  activeStage: 3,
  album: 'yes',
  notes: "Family names to be checked before selection. Use the client's Pinterest board for the cover reference.",
  tasks: [],
  vendors: { design: '', printing: '' },
  vendorOptions: [
    { name: 'Design partner', vendorType: 'design' },
    { name: 'Print partner', vendorType: 'printing' },
  ],
  editors: [],
  videos: [
    { id: 'reel-01', name: 'Reel 01', type: 'reel', status: 'Editing', progress: 75, due: '24 Feb', assignee: 'PS', person: 'Priya S.', priority: 'High priority' },
    { id: 'reel-02', name: 'Reel 02', type: 'reel', status: 'Data backup', progress: 25, due: '26 Feb', assignee: 'RV', person: 'Rohan V.' },
    { id: 'full-film', name: 'Full length film', type: 'full', status: 'Data backup', progress: 25, due: '28 Feb', assignee: 'PS', person: 'Priya S.' },
  ],
};
const storedState = JSON.parse(localStorage.getItem(stateKey) || 'null');
const state = { ...defaultState, ...storedState, tasks: storedState?.tasks || [], videos: storedState?.videos || defaultState.videos, vendors: storedState?.vendors || defaultState.vendors, vendorOptions: storedState?.vendorOptions || defaultState.vendorOptions, editors: storedState?.editors || defaultState.editors, activities: storedState?.activities || [] };
const apiBase = `/api/projects/${currentProjectId}`;
const loginScreen = document.getElementById('loginScreen');
const appShell = document.querySelector('.app-shell');
const albumPhotoNames = ['Shoot', 'Data backup', 'Album decision', 'Photo selection', 'Design vendor', 'Printing', 'Deliver'];
const timeline = document.getElementById('photoTimeline');
const videoGrid = document.getElementById('videoGrid');
const modalBackdrop = document.getElementById('modalBackdrop');
const itemForm = document.getElementById('itemForm');
const partnerModalBackdrop = document.getElementById('partnerModalBackdrop');
const partnerForm = document.getElementById('partnerForm');
const partnerSelect = document.getElementById('partnerSelect');
const searchBackdrop = document.getElementById('searchBackdrop');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let modalMode = 'task';
videoGrid.id = 'videoPanel';
let lastFocusedElement = null;
let projectEventSource = null;

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
mobileMenu.innerHTML = '<a href="projects.html">All projects</a><a href="index.html">Overview</a><a href="#photo-flow">Photo flow</a><a href="#video-flow">Video flow</a><a href="vendors.html">Vendors</a><a href="team.html">Users</a>';
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

function saveState() { localStorage.setItem(stateKey, JSON.stringify(state)); }
function refreshActivityViews() { renderNotifications(); renderActivityFeed(); }
async function syncProject(changes) {
  saveState();
  try {
    const response = await fetch(apiBase, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    if (!response.ok) throw new Error('Project sync failed');
    const project = await response.json();
    state.activities = project.activities || state.activities;
    refreshActivityViews();
  } catch { /* localStorage keeps the app usable offline */ }
}
async function postToApi(path, body) {
  try {
    const response = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('API request failed');
    return response.json();
  } catch { return null; }
}
async function patchVideo(video) {
  saveState();
  if (!video.id) return;
  try {
    const response = await fetch(`${apiBase}/videos/${video.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: video.status, progress: video.progress }) });
    if (!response.ok) return;
    const project = await response.json();
    state.activities = project.activities || state.activities;
    refreshActivityViews();
  } catch { /* localStorage keeps the app usable offline */ }
}
async function loadProject() {
  try {
    const response = await fetch(apiBase);
    if (response.status === 404) { window.location.href = 'projects.html'; return; }
    if (!response.ok) throw new Error('Project load failed');
    const project = await response.json();
    Object.assign(state, project, { tasks: project.tasks || [], videos: project.videos || [], editors: project.editors || [], vendorOptions: project.vendorOptions || [], activities: project.activities || [], vendors: { design: project.designVendor || project.partners?.find((partner) => partner.assignmentType === 'album_design')?.name || '', printing: project.printingVendor || project.partners?.find((partner) => partner.assignmentType === 'printing')?.name || '' } });
    document.getElementById('notesText').textContent = state.notes;
    document.querySelectorAll('[data-album]').forEach((button) => button.classList.toggle('selected', button.dataset.album === state.album));
    renderTimeline();
    renderVideos();
    renderTasks();
    renderVendors();
    renderHeader();
    renderStats();
    renderDelivery();
    renderTeamAvatars();
    renderNotifications();
    renderActivityFeed();
  } catch { /* direct file mode uses localStorage */ }
}
function connectProjectEvents() {
  if (isOfflineMode || !currentProjectId || !window.EventSource) return;
  projectEventSource?.close();
  projectEventSource = new EventSource(`${apiBase}/events`);
  projectEventSource.addEventListener('project-updated', async () => {
    await loadProject();
    showToast('Project updated in another session');
  });
}
async function checkSession() {
  if (isOfflineMode) {
    if (localStorage.getItem('frameflow-local-session') !== 'active') {
      loginScreen.hidden = false;
      appShell.hidden = true;
      return;
    }
    loginScreen.hidden = true;
    appShell.hidden = false;
    renderHeader();
    renderStats();
    renderDelivery();
    renderTeamAvatars();
    renderNotifications();
    renderActivityFeed();
    return;
  }
  try {
    const response = await fetch('/api/auth/me');
    const result = await response.json();
    if (result.authenticated) {
      loginScreen.hidden = true;
      appShell.hidden = false;
      applyCurrentUser(result.user);
      await applyWorkspaceSettings();
      if (!currentProjectId) { window.location.href = 'projects.html'; return; }
      await loadProject();
      connectProjectEvents();
    } else { loginScreen.hidden = false; appShell.hidden = true; document.getElementById('loginEmail').focus(); }
  } catch { loginScreen.hidden = false; appShell.hidden = true; document.getElementById('loginEmail').focus(); }
}
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2600);
}
function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days < 2 ? 'Yesterday' : `${days} days ago`;
}
function entityIcon(type) { return { task: '✓', video: '↗', vendor: '✦', deliverable: '↗', project: '◈' }[type] || '•'; }
function renderHeader() {
  document.getElementById('projectNameHeading').textContent = state.name || 'Untitled project';
  document.getElementById('breadcrumbProject').textContent = state.name || 'Project';
  document.getElementById('projectType').textContent = state.type || 'Production';
  document.getElementById('projectDate').textContent = state.date || 'Date TBC';
  document.getElementById('projectLocation').textContent = state.location || 'Location TBC';
  document.getElementById('projectTags').innerHTML = [state.type || 'Production', state.album === 'yes' ? 'Album: Yes' : 'Album: No'].map((tag) => `<span>${tag}</span>`).join('');
  document.getElementById('projectUpdated').textContent = state.updatedAt ? `Updated ${timeAgo(state.updatedAt)}` : '';
  if (currentProjectId) document.getElementById('overviewNavLink').href = `index.html?id=${encodeURIComponent(currentProjectId)}`;
}
function renderStats() {
  const stageNames = state.album === 'yes' ? albumPhotoNames : ['Shoot', 'Data backup', 'Album decision', 'Deliver'];
  const total = stageNames.length;
  const completed = Math.min(state.activeStage, total);
  const pct = total ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progressPercent').textContent = `${pct}%`;
  const bar = document.getElementById('progressBar');
  bar.querySelector('span').style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', String(pct));
  document.getElementById('progressNote').textContent = `${completed} of ${total} photo stages complete`;
  document.getElementById('photoFlowCount').textContent = `${completed} of ${total} complete`;
  const completedVideos = state.videos.filter((video) => video.progress === 100).length;
  document.getElementById('videoCount').textContent = `${completedVideos} of ${state.videos.length} complete`;
  document.getElementById('openItemsCount').textContent = String(state.tasks.length).padStart(2, '0');
  document.getElementById('openItemsNote').textContent = state.tasks.length ? `${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'} open` : 'All caught up';
}
function renderDelivery() {
  const parsed = state.date ? new Date(state.date) : null;
  const daysEl = document.getElementById('daysToDelivery');
  const targetEl = document.getElementById('deliveryTarget');
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const diffDays = Math.ceil((parsed - new Date()) / 86400000);
    daysEl.innerHTML = diffDays >= 0 ? `${diffDays} <small>days</small>` : `${Math.abs(diffDays)} <small>days ago</small>`;
    targetEl.textContent = `Target: ${state.date}`;
  } else {
    daysEl.textContent = '—';
    targetEl.textContent = 'No date set';
  }
}
function renderTeamAvatars() {
  const container = document.getElementById('teamAvatars');
  const unique = [...new Map(state.videos.map((video) => [video.assignee, video.person])).entries()];
  const shown = unique.slice(0, 4);
  container.innerHTML = shown.map(([initials]) => `<span aria-hidden="true">${initials}</span>`).join('') + (unique.length > 4 ? `<span aria-hidden="true">+${unique.length - 4}</span>` : '');
  container.setAttribute('aria-label', `${unique.length} people assigned`);
  document.getElementById('teamCount').textContent = unique.length ? `${unique.length} people assigned` : 'No one assigned yet';
}
function renderNotifications() {
  const list = document.getElementById('notificationList');
  const items = (state.activities || []).slice(0, 5);
  list.innerHTML = items.length ? items.map((item) => `<button data-activity-id="${item.id}"><span class="notice-dot" aria-hidden="true"></span>${item.action}<small>${timeAgo(item.createdAt)}</small></button>`).join('') : '<p class="search-empty">No notifications yet.</p>';
  list.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    document.getElementById('notificationPopover').hidden = true;
    document.querySelector('[aria-label="Open notifications"]').setAttribute('aria-expanded', 'false');
    document.getElementById('activitySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
let activityExpanded = false;
function renderActivityFeed() {
  const activityList = document.getElementById('activityList');
  const items = state.activities || [];
  const visible = activityExpanded ? items : items.slice(0, 5);
  activityList.innerHTML = visible.length ? visible.map((item) => `<div><span class="activity-avatar blue" aria-hidden="true">${entityIcon(item.entityType)}</span><p>${item.action} <small>${timeAgo(item.createdAt)}</small></p></div>`).join('') : '<p class="registry-empty">No activity yet.</p>';
  const toggleBtn = document.getElementById('viewAllActivityBtn');
  toggleBtn.textContent = activityExpanded ? 'Show recent only ←' : 'View all activity →';
  toggleBtn.disabled = items.length <= 5;
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
  document.getElementById('topProfileBtn').textContent = initials;
  document.getElementById('topRoleLabel').textContent = user.role;
}

function renderTimeline() {
  const photoNames = state.album === 'yes' ? albumPhotoNames : ['Shoot', 'Data backup', 'Album decision', 'Deliver'];
  timeline.innerHTML = photoNames.map((name, index) => {
    const complete = index < state.activeStage;
    const current = index === state.activeStage;
    return `<button class="timeline-item ${current ? 'active' : ''} ${complete ? 'done' : ''}" data-stage="${index}" aria-current="${current ? 'step' : 'false'}" aria-label="${name}: ${complete ? 'completed' : current ? 'in progress' : 'not started'}"><span class="timeline-marker ${complete ? 'green' : current ? 'yellow' : 'gray'}" aria-hidden="true">${complete ? '✓' : index + 1}</span><span class="timeline-content"><strong>${name}</strong><small>${complete ? 'Completed' : current ? 'In progress' : 'Not started'}</small></span>${current ? '<span class="current-tag">CURRENT</span>' : ''}</button>`;
  }).join('');
  timeline.querySelectorAll('[data-stage]').forEach((item) => item.addEventListener('click', () => {
    state.activeStage = Number(item.dataset.stage);
    syncProject({ activeStage: state.activeStage });
    renderTimeline();
    showToast(`${photoNames[state.activeStage]} is now in progress`);
  }));
}

function renderVideos() {
  videoGrid.querySelectorAll('.video-card').forEach((card) => card.remove());
  state.videos.forEach((video, index) => {
    const card = document.createElement('article');
    card.className = 'video-card';
    const editor = state.editors.find((item) => item.deliverableId === video.id);
    card.innerHTML = `<div class="video-card-head"><div class="video-type ${video.type}" aria-hidden="true"><span>${video.type === 'full' ? '▱' : '↗'}</span></div><div><strong>${video.name}</strong><small>${video.type === 'full' ? '4K wedding film' : 'Instagram reel'} ${video.priority ? `<span class="priority">${video.priority}</span>` : ''}</small></div><button class="card-menu" aria-label="More options for ${video.name}" data-video-menu="${index}">•••</button></div><div class="video-progress"><div><span>${video.status}</span><strong>${video.progress}%</strong></div><div class="progress" role="progressbar" aria-label="${video.name} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${video.progress}"><span style="width:${video.progress}%"></span></div></div><div class="video-meta"><span>Due ${video.due}</span><span class="assignee"><b aria-hidden="true">${video.assignee}</b> ${video.person}</span></div><button class="editor-assignment" data-editor-video="${video.id}">Editor: ${editor?.editorName || video.person} <span aria-hidden="true">↗</span></button><button class="advance-btn" data-video-index="${index}" aria-label="${video.progress === 100 ? `${video.name} completed` : `Advance ${video.name} from ${video.status}`}" ${video.progress === 100 ? 'disabled' : ''}>${video.progress === 100 ? 'Completed' : 'Advance status'} <span aria-hidden="true">${video.progress === 100 ? '✓' : '→'}</span></button>`;
    videoGrid.insertBefore(card, document.getElementById('addVideoBtn'));
  });
  videoGrid.querySelectorAll('[data-video-index]').forEach((button) => button.addEventListener('click', () => advanceVideo(Number(button.dataset.videoIndex))));
  videoGrid.querySelectorAll('[data-video-menu]').forEach((button) => button.addEventListener('click', () => {
    const video = state.videos[Number(button.dataset.videoMenu)];
    if (window.confirm(`Remove ${video.name} from this project?`)) {
      state.videos.splice(Number(button.dataset.videoMenu), 1);
      saveState();
      if (!isOfflineMode && video.id) fetch(`${apiBase}/videos/${video.id}`, { method: 'DELETE' }).then((response) => response.ok && response.json()).then((project) => { if (project) { state.activities = project.activities || state.activities; refreshActivityViews(); } }).catch(() => {});
      renderVideos();
      renderStats();
      renderTeamAvatars();
      showToast(`${video.name} removed`);
    }
  }));
  videoGrid.querySelectorAll('[data-editor-video]').forEach((button) => button.addEventListener('click', async () => {
    const editorName = window.prompt('Enter the reel editor name', button.textContent.replace('Editor: ', '').replace(' ↗', '').trim());
    if (!editorName?.trim()) return;
    if (isOfflineMode) {
      const assignment = state.editors.find((item) => item.deliverableId === button.dataset.editorVideo);
      if (assignment) assignment.editorName = editorName.trim();
      else state.editors.push({ deliverableId: button.dataset.editorVideo, editorName: editorName.trim() });
      saveState();
      renderVideos();
      showToast(`${editorName.trim()} assigned as editor`);
      return;
    }
    const response = await fetch(`${apiBase}/editors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverableId: button.dataset.editorVideo, editorName: editorName.trim() }) });
    if (response.ok) { const project = await response.json(); Object.assign(state, project); saveState(); renderVideos(); refreshActivityViews(); showToast(`${editorName.trim()} assigned as editor`); }
  }));
}
function renderTasks() {
  const taskList = document.getElementById('taskList');
  taskList.innerHTML = state.tasks.map((task, index) => `<div class="task-row"><button class="task-check" aria-label="Complete ${task.name}" data-task-index="${index}"></button><div><strong>${task.name}</strong><small>${task.details || 'No details added'}</small></div><button class="task-remove" aria-label="Remove ${task.name}" data-remove-task="${index}">×</button></div>`).join('');
  taskList.querySelectorAll('[data-task-index]').forEach((button) => button.addEventListener('click', () => {
    const task = state.tasks[Number(button.dataset.taskIndex)];
    const removedTask = state.tasks.splice(Number(button.dataset.taskIndex), 1)[0];
    if (removedTask.id) fetch(`${apiBase}/tasks/${removedTask.id}`, { method: 'DELETE' }).then((response) => response.ok && response.json()).then((project) => { if (project) { state.activities = project.activities || state.activities; refreshActivityViews(); } }).catch(() => {});
    saveState();
    updateOpenItems();
    renderTasks();
    showToast(`${task.name} completed`);
  }));
  taskList.querySelectorAll('[data-remove-task]').forEach((button) => button.addEventListener('click', () => {
    const removedTask = state.tasks.splice(Number(button.dataset.removeTask), 1)[0];
    if (removedTask.id) fetch(`${apiBase}/tasks/${removedTask.id}`, { method: 'DELETE' }).then((response) => response.ok && response.json()).then((project) => { if (project) { state.activities = project.activities || state.activities; refreshActivityViews(); } }).catch(() => {});
    saveState();
    updateOpenItems();
    renderTasks();
    showToast('Task removed');
  }));
}
function updateOpenItems() {
  document.getElementById('openItemsCount').textContent = String(state.tasks.length).padStart(2, '0');
  document.getElementById('openItemsNote').textContent = state.tasks.length ? `${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'} open` : 'All caught up';
}
function renderVendors() {
  document.getElementById('designVendorText').textContent = state.vendors.design || 'Not assigned';
  document.getElementById('printingVendorText').textContent = state.vendors.printing || 'Not assigned';
}
function searchItems(query) {
  const term = query.trim().toLowerCase();
  if (!term) { searchResults.innerHTML = '<p class="search-empty">Start typing to search this project.</p>'; return; }
  const items = [
    { name: state.name || 'This project', detail: `${state.type || 'Production'} · ${state.location || ''}`.trim(), type: 'Project', target: '#overview', icon: '⌂' },
    ...albumPhotoNames.map((name) => ({ name, detail: 'Photo workflow stage', type: 'Photo flow', target: '#photo-flow', icon: '▧' })),
    ...state.videos.map((video) => ({ name: video.name, detail: `${video.status} · ${video.progress}%`, type: 'Video deliverable', target: '#video-flow', icon: video.type === 'full' ? '▱' : '↗' })),
    ...state.tasks.map((task) => ({ name: task.name, detail: task.details || 'Project task', type: 'Task', target: '#photo-flow', icon: '✓' })),
    ...(state.vendors.design ? [{ name: state.vendors.design, detail: 'Design vendor', type: 'Vendor', target: '#photo-flow', icon: '✦' }] : []),
    ...(state.vendors.printing ? [{ name: state.vendors.printing, detail: 'Printing vendor', type: 'Vendor', target: '#photo-flow', icon: '▤' }] : []),
  ].filter((item) => `${item.name} ${item.detail} ${item.type}`.toLowerCase().includes(term));
  searchResults.innerHTML = items.length ? items.map((item) => `<button class="search-result" data-search-target="${item.target}"><span class="search-result-icon">${item.icon}</span><span class="search-result-copy"><strong>${item.name}</strong><small>${item.detail}</small></span><span class="search-result-type">${item.type}</span></button>`).join('') : '<p class="search-empty">No matching project items.</p>';
  searchResults.querySelectorAll('[data-search-target]').forEach((result) => result.addEventListener('click', () => { document.querySelector(result.dataset.searchTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeSearch(); }));
}
function openSearch() { lastFocusedElement = document.activeElement; searchBackdrop.hidden = false; searchInput.value = ''; searchItems(''); searchInput.focus(); }
function closeSearch() { searchBackdrop.hidden = true; lastFocusedElement?.focus(); }

function advanceVideo(index) {
  const video = state.videos[index];
  const next = video.status === 'Not started' ? ['Data backup', 25] : video.status === 'Data backup' ? ['Editing', 50] : video.status === 'Editing' ? ['Review', 90] : ['Complete', 100];
  [video.status, video.progress] = next;
  patchVideo(video);
  renderVideos();
  renderStats();
  showToast(`${video.name} advanced to ${video.status}`);
}

function openModal(mode) {
  modalMode = mode;
  document.getElementById('modalKicker').textContent = mode === 'task' ? 'NEW PROJECT TASK' : 'NEW VIDEO DELIVERABLE';
  document.getElementById('modalTitle').textContent = mode === 'task' ? 'Add a task' : 'Add a video deliverable';
  document.getElementById('itemTypeLabel').firstChild.textContent = mode === 'task' ? 'Task name' : 'Deliverable name';
  document.getElementById('itemName').placeholder = mode === 'task' ? 'e.g. Confirm family names' : 'e.g. Reel 03';
  document.getElementById('itemDetailLabel').firstChild.textContent = mode === 'task' ? 'Details' : 'Format and owner';
  lastFocusedElement = document.activeElement;
  modalBackdrop.hidden = false;
  document.getElementById('itemName').focus();
}
function closeModal() { modalBackdrop.hidden = true; itemForm.reset(); lastFocusedElement?.focus(); }
function openPartnerModal(type) {
  const label = type === 'printing' ? 'Printing vendor' : 'Design vendor';
  const options = state.vendorOptions.filter((vendor) => vendor.vendorType === type);
  partnerSelect.innerHTML = options.length ? options.map((vendor) => `<option value="${vendor.name}">${vendor.name}${vendor.contactName ? ` — ${vendor.contactName}` : ''}</option>`).join('') : '<option value="" disabled>No vendors configured</option>';
  partnerSelect.dataset.type = type;
  document.getElementById('partnerModalTitle').textContent = `Assign ${label.toLowerCase()}`;
  lastFocusedElement = document.activeElement;
  partnerModalBackdrop.hidden = false;
  partnerSelect.focus();
}
function closePartnerModal() { partnerModalBackdrop.hidden = true; lastFocusedElement?.focus(); }

document.querySelectorAll('[data-album]').forEach((button) => button.addEventListener('click', () => {
  state.album = button.dataset.album;
  state.activeStage = state.album === 'yes' ? Math.min(state.activeStage, 3) : Math.min(state.activeStage, 3);
  document.querySelectorAll('[data-album]').forEach((item) => item.classList.toggle('selected', item === button));
  document.querySelectorAll('[data-album]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  syncProject({ album: state.album });
  renderTimeline();
  showToast(state.album === 'yes' ? 'Album workflow enabled' : 'Album workflow skipped');
}));
document.getElementById('editNotesBtn').addEventListener('click', () => {
  const notes = document.getElementById('notesText');
  const editing = notes.contentEditable === 'true';
  if (editing) { state.notes = notes.textContent.trim(); syncProject({ notes: state.notes }); showToast('Notes saved'); }
  notes.contentEditable = String(!editing);
  document.getElementById('editNotesBtn').textContent = editing ? 'Edit notes' : 'Save notes';
  if (!editing) notes.focus();
});
document.getElementById('addTaskBtn').addEventListener('click', () => openModal('task'));
document.getElementById('addVideoBtn').addEventListener('click', () => openModal('video'));
document.querySelector('[aria-label="Search project"]').addEventListener('click', openSearch);
searchInput.addEventListener('input', () => searchItems(searchInput.value));
searchBackdrop.addEventListener('click', (event) => { if (event.target === searchBackdrop) closeSearch(); });
document.querySelector('[aria-label="Open notifications"]').addEventListener('click', () => {
  const popover = document.getElementById('notificationPopover');
  popover.hidden = !popover.hidden;
  document.querySelector('[aria-label="Open notifications"]').setAttribute('aria-expanded', String(!popover.hidden));
});
document.getElementById('workspaceBtn').addEventListener('click', () => { window.location.href = 'projects.html'; });
document.getElementById('settingsBtn').addEventListener('click', () => { window.location.href = 'settings.html'; });
document.getElementById('helpBtn').addEventListener('click', () => { window.location.href = 'help.html'; });
document.getElementById('profileBtn').addEventListener('click', () => { window.location.href = 'profile.html'; });
document.getElementById('topProfileBtn').addEventListener('click', () => { window.location.href = 'profile.html'; });
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (isOfflineMode) {
    localStorage.removeItem('frameflow-local-session');
    loginScreen.hidden = false;
    appShell.hidden = true;
    document.getElementById('loginError').textContent = 'You have been signed out.';
    return;
  }
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Logout failed');
    projectEventSource?.close();
    window.location.href = 'index.html';
  } catch {
    showToast('Could not sign out. Check that the server is running.');
  }
});
document.getElementById('viewAllActivityBtn').addEventListener('click', () => { activityExpanded = !activityExpanded; renderActivityFeed(); });
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileMenu.hidden) closeMobileMenu();
  if (event.key === 'Escape') { if (!modalBackdrop.hidden) closeModal(); if (!partnerModalBackdrop.hidden) closePartnerModal(); if (!searchBackdrop.hidden) closeSearch(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  const overlay = !modalBackdrop.hidden ? modalBackdrop : !partnerModalBackdrop.hidden ? partnerModalBackdrop : !searchBackdrop.hidden ? searchBackdrop : null;
  if (overlay && event.key === 'Tab') {
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), input, textarea, [href]')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('itemName').value.trim();
  const details = document.getElementById('itemDetails').value.trim();
  if (modalMode === 'video') {
    const video = { name, type: details.toLowerCase().includes('full') ? 'full' : 'reel', status: 'Not started', progress: 0, due: '02 Mar', assignee: 'AK', person: 'Arjun K.' };
    const serverProject = await postToApi('/videos', video);
    if (serverProject) Object.assign(state, serverProject);
    else state.videos.push(video);
    saveState();
    renderVideos();
    renderStats();
    renderTeamAvatars();
    if (serverProject) refreshActivityViews();
    showToast(`${name} added to video flow`);
  } else {
    const task = { name, details, createdAt: new Date().toISOString() };
    const serverProject = await postToApi('/tasks', task);
    if (serverProject) Object.assign(state, serverProject);
    else state.tasks.push(task);
    saveState();
    renderTasks();
    updateOpenItems();
    if (serverProject) refreshActivityViews();
    showToast(`${name} added to project tasks`);
  }
  closeModal();
});
document.querySelectorAll('[data-handoff]').forEach((button) => button.addEventListener('click', () => openPartnerModal(button.dataset.handoff)));
partnerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const type = partnerSelect.dataset.type;
  const name = partnerSelect.value;
  if (!name) return;
  if (isOfflineMode) {
    state.vendors[type] = name;
    saveState();
    renderVendors();
    closePartnerModal();
    showToast(`${name} assigned`);
    return;
  }
  const response = await fetch(`${apiBase}/partners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name }) });
  if (!response.ok) { showToast('Vendor assignment failed'); return; }
  const project = await response.json();
  Object.assign(state, project, { vendors: { design: project.designVendor || state.vendors.design, printing: project.printingVendor || state.vendors.printing }, vendorOptions: project.vendorOptions || state.vendorOptions });
  saveState();
  renderVendors();
  refreshActivityViews();
  closePartnerModal();
  showToast(`${name} assigned`);
});
document.getElementById('partnerModalClose').addEventListener('click', closePartnerModal);
document.getElementById('partnerCancel').addEventListener('click', closePartnerModal);
partnerModalBackdrop.addEventListener('click', (event) => { if (event.target === partnerModalBackdrop) closePartnerModal(); });
document.getElementById('projectMenuBtn').addEventListener('click', () => {
  const exportData = JSON.stringify(state, null, 2);
  const file = new Blob([exportData], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `frameflow-${currentProjectId || 'project'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Project data exported');
});
document.querySelectorAll('.collapse-btn').forEach((button) => button.addEventListener('click', () => {
  const section = button.closest('.section-bar').nextElementSibling;
  const collapsed = section.hidden;
  section.hidden = !collapsed;
  button.textContent = collapsed ? '⌃' : '⌄';
  button.setAttribute('aria-expanded', String(collapsed));
  button.setAttribute('aria-label', `${collapsed ? 'Collapse' : 'Expand'} ${button.closest('.section-bar').querySelector('h2').textContent}`);
}));

document.getElementById('notesText').textContent = state.notes;
updateOpenItems();
renderTasks();
renderVendors();
document.querySelectorAll('[data-album]').forEach((button) => button.classList.toggle('selected', button.dataset.album === state.album));
renderTimeline();
renderVideos();
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('loginError');
  error.textContent = '';
  if (isOfflineMode) {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (email !== 'admin@frameflow.local' || password !== 'ChangeMe123!') { error.textContent = 'Invalid email or password.'; return; }
    localStorage.setItem('frameflow-local-session', 'active');
    await checkSession();
    return;
  }
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { error.textContent = result.error || 'Invalid email or password.'; return; }
    await checkSession();
  } catch {
    error.textContent = 'Cannot connect to the server. Run npm start and try again.';
  }
});
checkSession();