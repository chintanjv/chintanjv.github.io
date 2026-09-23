/* main.js — renders data/projects.json + data/thoughts.json */

document.getElementById('year').textContent = new Date().getFullYear();

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

const buildProject = p => `
    <article class="thought-item">
      <a href="${esc(p.link)}" class="thought-title" target="_blank" rel="noopener">${esc(p.title)}</a>
      <p class="thought-summary">${esc(p.summary)}</p>
    </article>`;

const buildThought = t => `
    <article class="thought-item">
      <p class="thought-date">${formatDate(t.date)}</p>
      <a href="thoughts/${esc(t.slug)}.html" class="thought-title">${esc(t.title)}</a>
      <p class="thought-summary">${esc(t.summary)}</p>
    </article>`;

async function loadSection(name, build) {
  const list = document.getElementById(`${name}-list`);
  try {
    const items = await (await fetch(`data/${name}.json`)).json();
    list.innerHTML = items.map(build).join('');
  } catch (_) {
    list.innerHTML = `<p style="color:#555;font-size:14px">Could not load ${name}.</p>`;
  }
}

/* Nav links scroll to their section without adding #section to the URL */
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  scrollToSection(a.hash.slice(1));
}));

Promise.all([
  loadSection('projects', buildProject),
  loadSection('thoughts', buildThought),
]).then(() => {
  // Arriving from a post via /#projects or /#thoughts: scroll there, then clean the URL
  if (location.hash) {
    const id = location.hash.slice(1);
    history.replaceState(null, '', location.pathname);
    scrollToSection(id);
  }
});
