const toggle = document.getElementById('themeToggle');
const html = document.documentElement;

const storedTheme = localStorage.getItem('todopp-theme');
if (storedTheme) html.setAttribute('data-theme', storedTheme);

toggle.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('todopp-theme', next);
});

toggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
});
