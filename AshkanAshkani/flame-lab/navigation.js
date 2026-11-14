const labView = document.getElementById('lab-view');
const shipView = document.getElementById('spacecraft-view');
const links = {
  lab: document.getElementById('nav-lab'),
  spacecraft: document.getElementById('nav-spacecraft')
};
let shown;
function showView() {
  const hash = location.hash;
  if (hash === '#main') return;
  const view = ['#spacecraft', '#flight-evidence', '#ship-method'].includes(hash) ? 'spacecraft' : 'lab';
  labView.hidden = view !== 'lab';
  shipView.hidden = view !== 'spacecraft';
  for (const [key, link] of Object.entries(links)) {
    if (key === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.getElementById('browse-evidence').href = view === 'lab' ? '#evidence' : '#flight-evidence';
  if (shown && shown !== view) document.dispatchEvent(new Event('lab-viewchange'));
  shown = view;
  if (hash === '#lab' || hash === '#spacecraft') {
    window.scrollTo(0, 0);
  } else {
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }
}
window.addEventListener('hashchange', showView);
showView();
