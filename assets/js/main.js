/* ============================================================
   main.js
   Loads content from data/projects.json + data/thoughts.json
   
   PINNING: Set "pinned": true on up to 2 items per section.
   Pinned items always appear first and count toward the 4 visible.
   
   VISIBLE_COUNT: How many items show before "View more".
   ============================================================ */

const VISIBLE_COUNT = 4;

/* ---- YEAR ---- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---- HELPERS ---- */
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchJSON(path) {
  // Try root-relative first, then parent-relative (for subpages)
  for (const p of [path, '../' + path]) {
    try {
      const r = await fetch(p);
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  return null;
}

/* ---- PIN ICON ---- */
const PIN_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`;

/* ---- SETUP TOGGLE ---- */
function setupToggle(btnId, panelId, wrapId) {
  const btn   = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  const wrap  = document.getElementById(wrapId);
  if (!btn || !panel) return;

  wrap.style.display = 'block';

  btn.addEventListener('click', () => {
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
    btn.childNodes[0].textContent = isOpen ? 'View more' : 'View less';

    // Scroll expanded panel into view smoothly
    if (!isOpen) {
      setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  });
}

/* ---- RENDER PROJECTS ---- */
function buildProjectCard(p) {
  const cover = p.cover
    ? `<img src="${esc(p.cover)}" alt="${esc(p.title)}" class="project-cover" loading="lazy">`
    : '';
  const pin = p.pinned
    ? `<div class="project-pin">${PIN_ICON} Pinned</div>`
    : '';
  const tags = (p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const links = [
    p.link   && `<a href="${esc(p.link)}"   class="project-link" target="_blank" rel="noopener">View project ↗</a>`,
    p.github && p.github !== p.link
             && `<a href="${esc(p.github)}" class="project-link" target="_blank" rel="noopener">GitHub ↗</a>`
  ].filter(Boolean).join('');

  return `
    <article class="project-card">
      ${cover}
      ${pin}
      <h3 class="project-title">${esc(p.title)}</h3>
      <p class="project-summary">${esc(p.summary)}</p>
      ${tags ? `<div class="project-tags">${tags}</div>` : ''}
      <div class="project-links">${links}</div>
    </article>`;
}

async function loadProjects() {
  const grid         = document.getElementById('projects-grid');
  const overflowGrid = document.getElementById('projects-overflow-grid');
  if (!grid) return;

  const projects = await fetchJSON('data/projects.json');
  if (!projects) { grid.innerHTML = '<p style="color:#555;font-size:14px">Could not load projects.</p>'; return; }

  // Pinned first (max 2), then rest in original order
  const pinned   = projects.filter(p => p.pinned).slice(0, 2);
  const unpinned = projects.filter(p => !p.pinned);
  const sorted   = [...pinned, ...unpinned];

  const visible  = sorted.slice(0, VISIBLE_COUNT);
  const hidden   = sorted.slice(VISIBLE_COUNT);

  grid.innerHTML = visible.map(buildProjectCard).join('');

  if (hidden.length > 0) {
    overflowGrid.innerHTML = hidden.map(buildProjectCard).join('');
    setupToggle('projects-toggle', 'projects-overflow', 'projects-more-wrap');
  }
}

/* ---- RENDER THOUGHTS ---- */
function buildThoughtItem(t) {
  const pin = t.pinned
    ? `<div class="thought-pin">${PIN_ICON} Pinned</div>`
    : '';
  const tags = (t.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');

  return `
    <article class="thought-item">
      ${pin}
      <p class="thought-date">${formatDate(t.date)}</p>
      <a href="thoughts/${esc(t.slug)}.html" class="thought-title">${esc(t.title)}</a>
      <p class="thought-summary">${esc(t.summary)}</p>
      ${tags ? `<div class="thought-tags">${tags}</div>` : ''}
    </article>`;
}

async function loadThoughts() {
  const list         = document.getElementById('thoughts-list');
  const overflowList = document.getElementById('thoughts-overflow-list');
  if (!list) return;

  const thoughts = await fetchJSON('data/thoughts.json');
  if (!thoughts) { list.innerHTML = '<p style="color:#555;font-size:14px">Could not load posts.</p>'; return; }

  const pinned   = thoughts.filter(t => t.pinned).slice(0, 2);
  const unpinned = thoughts.filter(t => !t.pinned);
  const sorted   = [...pinned, ...unpinned];

  const visible  = sorted.slice(0, VISIBLE_COUNT);
  const hidden   = sorted.slice(VISIBLE_COUNT);

  list.innerHTML = visible.map(buildThoughtItem).join('');

  if (hidden.length > 0) {
    overflowList.innerHTML = hidden.map(buildThoughtItem).join('');
    setupToggle('thoughts-toggle', 'thoughts-overflow', 'thoughts-more-wrap');
  }
}

/* ---- INIT ---- */
loadProjects();
loadThoughts();
