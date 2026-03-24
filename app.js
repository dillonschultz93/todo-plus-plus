import { createClient } from '@supabase/supabase-js';

/* ---- SUPABASE ---- */
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

function toDbRow(todo) {
    return {
        text: todo.text,
        done: todo.done,
        status: todo.status,
        notes: todo.notes,
        due_date: todo.dueDate,
        subtasks: todo.subtasks,
        labels: todo.labels,
        priority: todo.priority,
        focus_date: todo.focusDate,
        archived: todo.archived,
    };
}

function fromDbRow(row) {
    return {
        id: row.id,
        text: row.text,
        done: row.done,
        status: row.status,
        notes: row.notes || '',
        dueDate: row.due_date || null,
        subtasks: row.subtasks || [],
        labels: row.labels || [],
        priority: row.priority || 'low',
        focusDate: row.focus_date || null,
        archived: row.archived || false,
    };
}

async function dbSaveTodo(todo) {
    const { error } = await supabase.from('todos').update(toDbRow(todo)).eq('id', todo.id);
    if (error) console.error('Failed to save todo:', error);
}

async function dbDeleteTodo(id) {
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) console.error('Failed to delete todo:', error);
}

async function dbDeleteCompleted() {
    const { error } = await supabase.from('todos').delete().eq('done', true);
    if (error) console.error('Failed to clear completed:', error);
}

async function dbInsertTodo(fields) {
    const { data, error } = await supabase
        .from('todos')
        .insert(fields)
        .select()
        .single();
    if (error) { console.error('Failed to add todo:', error); return null; }
    return fromDbRow(data);
}

async function dbLoadTodos() {
    const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) { console.error('Failed to load todos:', error); return []; }
    return data.map(fromDbRow);
}

function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function dbArchiveSweep() {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { error } = await supabase
        .from('todos')
        .update({ archived: true })
        .eq('done', false)
        .eq('archived', false)
        .lt('updated_at', cutoff);
    if (error) console.error('Archive sweep failed:', error);
}

async function dbClearStaleFocusDates() {
    const today = getTodayStr();
    const { error } = await supabase
        .from('todos')
        .update({ focus_date: null })
        .not('focus_date', 'is', null)
        .lt('focus_date', today);
    if (error) console.error('Focus date cleanup failed:', error);
}

/* ---- THEME TOGGLE ---- */
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

/* ---- DATA ---- */
const VIEW_KEY = 'todopp-view';
const LABEL_COLORS_KEY = 'todopp-label-colors';

let todos = [];
let filter = 'all';
let priorityFilter = 'all';
let currentView = localStorage.getItem(VIEW_KEY) || 'list';
let expandedId = null;
let editingId = null;
let expandClickTimer = null;
let notesSaveTimer = null;

const PRIORITY_LEVELS = ['urgent', 'high', 'medium', 'low'];
const PRIORITY_LABELS = { urgent: 'U', high: 'H', medium: 'M', low: 'L' };
const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: 'var(--text-tertiary)' };

const STATUS_LABELS = {
    'backlog': 'Backlog',
    'in-progress': 'In Progress',
    'done': 'Done'
};

const COLOR_PALETTE = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];
let labelColors = JSON.parse(localStorage.getItem(LABEL_COLORS_KEY) || '{}');

function saveLabelColors() {
    localStorage.setItem(LABEL_COLORS_KEY, JSON.stringify(labelColors));
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function getLabelColor(name) {
    if (!labelColors[name]) {
        const used = new Set(Object.values(labelColors));
        labelColors[name] = COLOR_PALETTE.find(c => !used.has(c))
            || COLOR_PALETTE[Object.keys(labelColors).length % COLOR_PALETTE.length];
        saveLabelColors();
    }
    return labelColors[name];
}

function getDueDateState(todo) {
    if (!todo.dueDate || todo.done) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(todo.dueDate + 'T00:00:00');
    const diff = Math.floor((due - today) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    return 'upcoming';
}

function formatDueDate(dateStr) {
    const due = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((due - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---- WEATHER & HOLIDAYS ---- */
const LOCATION_KEY = 'todopp-location';
const COUNTRY_KEY = 'todopp-country';

let weatherCache = {};
let holidayCache = {};

const WMO_ICONS = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
    80: '🌦️', 81: '🌦️', 82: '🌧️', 85: '🌨️', 86: '🌨️',
    95: '⛈️', 96: '⛈️', 99: '⛈️',
};

function getWeatherIcon(code) { return WMO_ICONS[code] || '🌡️'; }
function getWeatherForDate(dateStr) { return weatherCache[dateStr] || null; }
function getHolidayForDate(dateStr) { return holidayCache[dateStr] || null; }

async function loadLocation() {
    const stored = localStorage.getItem(LOCATION_KEY);
    if (stored) return JSON.parse(stored);

    return new Promise(resolve => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            pos => {
                const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
                resolve(loc);
            },
            () => resolve(null),
            { timeout: 5000 }
        );
    });
}

async function searchCity(query) {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`);
        const data = await res.json();
        if (data.results?.length) {
            const loc = { lat: data.results[0].latitude, lon: data.results[0].longitude };
            localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
            return loc;
        }
    } catch (e) { console.error('City search failed:', e); }
    return null;
}

async function loadWeather(loc) {
    if (!loc) return;
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
            `&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
        );
        const data = await res.json();
        if (!data.daily) return;
        data.daily.time.forEach((date, i) => {
            weatherCache[date] = {
                code: data.daily.weathercode[i],
                hi: Math.round(data.daily.temperature_2m_max[i]),
            };
        });
    } catch (e) { console.error('Weather load failed:', e); }
}

function detectCountry() {
    const stored = localStorage.getItem(COUNTRY_KEY);
    if (stored) return stored;
    const lang = navigator.language || 'en-US';
    const parts = lang.split('-');
    const country = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'US';
    localStorage.setItem(COUNTRY_KEY, country);
    return country;
}

async function loadHolidays() {
    const country = detectCountry();
    const year = new Date().getFullYear();
    try {
        const responses = await Promise.all(
            [year, year + 1].map(y =>
                fetch(`https://date.nager.at/api/v3/publicholidays/${y}/${country}`).then(r => r.json())
            )
        );
        responses.flat().forEach(h => { holidayCache[h.date] = h.localName || h.name; });
    } catch (e) { console.error('Holiday load failed:', e); }
}

/* ---- SHARED RENDERERS ---- */
function renderPriorityDot(todo) {
    if (todo.priority === 'low') return '';
    return `<span class="priority-dot" style="--priority-color:${PRIORITY_COLORS[todo.priority]}" title="${todo.priority}"></span>`;
}

function renderPrioritySelector(todo) {
    const btns = PRIORITY_LEVELS.map(p =>
        `<button class="priority-btn${todo.priority === p ? ' active' : ''}" data-id="${todo.id}" data-priority="${p}" style="--priority-color:${PRIORITY_COLORS[p]}">${PRIORITY_LABELS[p]}</button>`
    ).join('');
    return `
        <div class="panel-field">
            <label class="panel-label">Priority</label>
            <div class="priority-selector">${btns}</div>
        </div>
    `;
}

function renderLabelsRow(todo) {
    if (!todo.labels.length) return '';
    const chips = todo.labels.map(l =>
        `<span class="label-chip" style="--label-color:${getLabelColor(l)}">${escapeHtml(l)}</span>`
    ).join('');
    return `<div class="labels-row">${chips}</div>`;
}

function renderMetaChips(todo) {
    const parts = [];
    if (todo.dueDate) {
        const state = getDueDateState(todo);
        const cls = state ? ` due-${state}` : '';
        const weather = getWeatherForDate(todo.dueDate);
        const weatherHtml = weather
            ? ` <span class="weather-info">${getWeatherIcon(weather.code)} ${weather.hi}°</span>`
            : '';
        parts.push(`<span class="due-chip${cls}">${formatDueDate(todo.dueDate)}${weatherHtml}</span>`);

        const holiday = getHolidayForDate(todo.dueDate);
        if (holiday) parts.push(`<span class="holiday-badge" title="${escapeHtml(holiday)}">🎉 ${escapeHtml(holiday)}</span>`);
    }
    if (todo.subtasks.length) {
        const done = todo.subtasks.filter(s => s.done).length;
        const all = todo.subtasks.length;
        const cls = done === all ? ' subtask-complete' : '';
        parts.push(`<span class="subtask-progress${cls}">${done}/${all}</span>`);
    }
    if (!parts.length) return '';
    return `<div class="meta-chips">${parts.join('')}</div>`;
}

function renderExpandedPanel(todo) {
    const subtasksHtml = todo.subtasks.map(s => `
        <div class="subtask-item${s.done ? ' done' : ''}">
            <div class="subtask-checkbox${s.done ? ' checked' : ''}" data-id="${todo.id}" data-sid="${s.id}"></div>
            <span class="subtask-text">${escapeHtml(s.text)}</span>
            <button class="subtask-delete" data-id="${todo.id}" data-sid="${s.id}">&times;</button>
        </div>
    `).join('');

    const labelsHtml = todo.labels.map(l =>
        `<span class="label-chip" style="--label-color:${getLabelColor(l)}">${escapeHtml(l)}<button class="label-remove" data-id="${todo.id}" data-label="${escapeHtml(l)}">&times;</button></span>`
    ).join('');

    return `
        <div class="expanded-panel">
            ${renderPrioritySelector(todo)}
            <div class="panel-field">
                <label class="panel-label">Due date</label>
                <div class="due-row">
                    <input type="date" class="due-input" data-id="${todo.id}" value="${todo.dueDate || ''}">
                    ${todo.dueDate ? `<button class="clear-due" data-id="${todo.id}">&times;</button>` : ''}
                </div>
            </div>
            <div class="panel-field">
                <label class="panel-label">Notes</label>
                <textarea class="notes-input" data-id="${todo.id}" placeholder="Add notes\u2026" rows="2">${escapeHtml(todo.notes)}</textarea>
            </div>
            <div class="panel-field">
                <label class="panel-label">Subtasks</label>
                <div class="subtask-list">${subtasksHtml}</div>
                <input type="text" class="subtask-add" data-id="${todo.id}" placeholder="Add a subtask\u2026">
            </div>
            <div class="panel-field">
                <label class="panel-label">Labels</label>
                <div class="label-editor">${labelsHtml}<input type="text" class="label-add" data-id="${todo.id}" placeholder="Add label\u2026"></div>
            </div>
        </div>
    `;
}

function wireExpandedPanel(container, todo, renderFn) {
    const panel = container.querySelector('.expanded-panel');
    if (!panel) return;

    panel.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            todo.priority = btn.dataset.priority;
            dbSaveTodo(todo);
            renderFn();
        });
    });

    panel.querySelector('.notes-input')?.addEventListener('input', e => {
        todo.notes = e.target.value;
        clearTimeout(notesSaveTimer);
        notesSaveTimer = setTimeout(() => dbSaveTodo(todo), 500);
    });

    panel.querySelector('.due-input')?.addEventListener('change', e => {
        todo.dueDate = e.target.value || null;
        dbSaveTodo(todo);
        renderFn();
    });

    panel.querySelector('.clear-due')?.addEventListener('click', () => {
        todo.dueDate = null;
        dbSaveTodo(todo);
        renderFn();
    });

    panel.querySelectorAll('.subtask-checkbox').forEach(cb => {
        cb.addEventListener('click', () => {
            const sid = Number(cb.dataset.sid);
            const sub = todo.subtasks.find(s => s.id === sid);
            if (sub) { sub.done = !sub.done; dbSaveTodo(todo); renderFn(); }
        });
    });

    panel.querySelectorAll('.subtask-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const sid = Number(btn.dataset.sid);
            todo.subtasks = todo.subtasks.filter(s => s.id !== sid);
            dbSaveTodo(todo);
            renderFn();
        });
    });

    panel.querySelector('.subtask-add')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const text = e.target.value.trim();
        if (!text) return;
        todo.subtasks.push({ id: Date.now() + Math.random(), text, done: false });
        dbSaveTodo(todo);
        renderFn();
    });

    panel.querySelectorAll('.label-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.dataset.label;
            todo.labels = todo.labels.filter(l => l !== label);
            dbSaveTodo(todo);
            renderFn();
        });
    });

    panel.querySelector('.label-add')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const label = e.target.value.trim().toLowerCase();
        if (!label || todo.labels.includes(label)) { e.target.value = ''; return; }
        todo.labels.push(label);
        getLabelColor(label);
        dbSaveTodo(todo);
        renderFn();
    });
}

function wireTitleEdit(container, todo, renderFn) {
    const inp = container.querySelector('.title-edit');
    if (!inp) return;
    inp.focus();
    inp.select();

    const commit = () => {
        const val = inp.value.trim();
        if (val && val !== todo.text) { todo.text = val; dbSaveTodo(todo); }
        editingId = null;
        renderFn();
    };

    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { editingId = null; renderFn(); }
    });
}

/* ---- DOM REFS ---- */
const todoSection = document.getElementById('todoSection');
const todoInput   = document.getElementById('todoInput');
const addBtn      = document.getElementById('addBtn');
const listViewEl  = document.getElementById('listView');
const boardViewEl = document.getElementById('boardView');
const focusViewEl = document.getElementById('focusView');
const list        = document.getElementById('todoList');
const statusBar   = document.getElementById('statusBar');
const itemCount   = document.getElementById('itemCount');
const clearBtn    = document.getElementById('clearCompleted');
const filterBtns  = document.querySelectorAll('.status-filters button');
const priorityBtns = document.querySelectorAll('.priority-filters button');
const viewBtns    = document.querySelectorAll('#viewToggle button');

/* ---- VIEW SWITCHING ---- */
function setView(view) {
    currentView = view;
    localStorage.setItem(VIEW_KEY, view);
    editingId = null;

    viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));

    listViewEl.style.display = view === 'list' ? '' : 'none';
    boardViewEl.style.display = view === 'board' ? '' : 'none';
    focusViewEl.style.display = view === 'focus' ? '' : 'none';
    todoSection.classList.toggle('board-active', view === 'board');

    if (view === 'list') renderList(true);
    else if (view === 'board') renderBoard();
    else renderFocus();
}

viewBtns.forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
});

/* ---- LIST VIEW ---- */
function renderList(skipAnimation) {
    const isArchivedView = filter === 'archived';
    let filtered = todos.filter(t => {
        if (isArchivedView) return t.archived;
        if (t.archived) return false;
        if (filter === 'active')    return !t.done;
        if (filter === 'completed') return t.done;
        return true;
    });
    if (priorityFilter !== 'all') {
        filtered = filtered.filter(t => t.priority === priorityFilter);
    }

    list.innerHTML = '';

    const activeTodos = todos.filter(t => !t.archived);
    if (activeTodos.length === 0 && !isArchivedView) {
        list.innerHTML = '<li class="empty-state">Nothing here yet. Add your first task above.</li>';
        statusBar.style.display = 'none';
        return;
    }

    if (filtered.length === 0) {
        const label = isArchivedView ? 'archived' : filter === 'active' ? 'active' : filter === 'completed' ? 'completed' : '';
        list.innerHTML = `<li class="empty-state">No ${label} tasks</li>`;
    }

    const todayStr = getTodayStr();

    filtered.forEach(todo => {
        const li = document.createElement('li');
        const isExpanded = expandedId === todo.id;
        const isEditing = editingId === todo.id;
        li.className = 'todo-item' + (todo.done ? ' completed' : '') + (isExpanded ? ' expanded' : '') + (isArchivedView ? ' archived-item' : '');
        if (skipAnimation) li.style.animation = 'none';

        const notesIndicator = todo.notes && !isExpanded ? '<span class="notes-indicator"></span>' : '';
        const statusLabel = STATUS_LABELS[todo.status] || 'Backlog';
        const dotClass = todo.status === 'done' ? 'dot-done' : todo.status === 'in-progress' ? 'dot-progress' : 'dot-backlog';

        const titleHtml = isEditing
            ? `<input class="title-edit" value="${escapeHtml(todo.text)}" data-id="${todo.id}">`
            : `<span class="text">${renderPriorityDot(todo)}${escapeHtml(todo.text)}${notesIndicator}</span>`;

        const isFocused = todo.focusDate === todayStr;
        const focusBtnHtml = !todo.done && !isArchivedView
            ? `<button class="focus-btn${isFocused ? ' active' : ''}" data-id="${todo.id}" title="${isFocused ? 'Remove from focus' : 'Focus today'}">🎯</button>`
            : '';

        const restoreBtnHtml = isArchivedView
            ? `<button class="restore-btn" data-id="${todo.id}">Restore</button>`
            : '';

        li.innerHTML = `
            <div class="checkbox" data-id="${todo.id}"></div>
            <div class="todo-content" data-id="${todo.id}">
                ${titleHtml}
                ${!isExpanded ? renderLabelsRow(todo) : ''}
                ${isExpanded ? renderExpandedPanel(todo) : ''}
            </div>
            ${renderMetaChips(todo)}
            ${focusBtnHtml}
            <span class="status-badge"><span class="board-column-dot ${dotClass}"></span>${statusLabel}</span>
            ${restoreBtnHtml}
            <button class="delete-btn" data-id="${todo.id}">&times;</button>
        `;

        list.appendChild(li);

        if (isExpanded) wireExpandedPanel(li, todo, () => renderList(true));
        if (isEditing) wireTitleEdit(li, todo, () => renderList(true));
    });

    const remaining = activeTodos.filter(t => !t.done).length;
    itemCount.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
    clearBtn.style.display = activeTodos.some(t => t.done) ? '' : 'none';
    statusBar.style.display = '';
}

list.addEventListener('click', e => {
    if (e.target.closest('.expanded-panel') || e.target.closest('.title-edit')) return;

    const focusBtn = e.target.closest('.focus-btn');
    if (focusBtn) {
        const id = Number(focusBtn.dataset.id);
        const todo = todos.find(t => t.id === id);
        if (!todo) return;
        const today = getTodayStr();
        todo.focusDate = todo.focusDate === today ? null : today;
        dbSaveTodo(todo);
        renderList(true);
        return;
    }

    const restoreBtn = e.target.closest('.restore-btn');
    if (restoreBtn) {
        const id = Number(restoreBtn.dataset.id);
        const todo = todos.find(t => t.id === id);
        if (!todo) return;
        todo.archived = false;
        dbSaveTodo(todo);
        renderList(true);
        return;
    }

    const checkbox = e.target.closest('.checkbox');
    const deleteBtn = e.target.closest('.delete-btn');
    const content = e.target.closest('.todo-content');

    if (content) {
        const id = Number(content.dataset.id);
        clearTimeout(expandClickTimer);
        expandClickTimer = setTimeout(() => {
            expandClickTimer = null;
            expandedId = expandedId === id ? null : id;
            editingId = null;
            renderList(true);
        }, 250);
        return;
    }

    if (checkbox) {
        const id = Number(checkbox.dataset.id);
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        todo.done = !todo.done;
        todo.status = todo.done ? 'done' : 'backlog';
        dbSaveTodo(todo);

        if (todo.done) {
            const item = checkbox.closest('.todo-item');
            item.classList.add('completed');
            item.classList.add('gravity-drop');
            item.addEventListener('animationend', () => renderList(), { once: true });
        } else {
            renderList();
        }
    }

    if (deleteBtn) {
        const id = Number(deleteBtn.dataset.id);
        const item = deleteBtn.closest('.todo-item');
        item.classList.add('gravity-drop');
        item.addEventListener('animationend', () => {
            todos = todos.filter(t => t.id !== id);
            dbDeleteTodo(id);
            renderList();
        }, { once: true });
    }
});

list.addEventListener('dblclick', e => {
    const textEl = e.target.closest('.text');
    if (!textEl) return;
    clearTimeout(expandClickTimer);
    expandClickTimer = null;
    const content = textEl.closest('.todo-content');
    if (!content) return;
    editingId = Number(content.dataset.id);
    renderList(true);
});

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filter = btn.dataset.filter;
        renderList(true);
    });
});

priorityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        priorityBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        priorityFilter = btn.dataset.priority;
        renderList(true);
    });
});

clearBtn.addEventListener('click', () => {
    const completed = list.querySelectorAll('.todo-item.completed');
    let pending = completed.length;

    if (pending === 0) {
        dbDeleteCompleted();
        todos = todos.filter(t => !t.done);
        renderList();
        return;
    }

    completed.forEach((item, i) => {
        setTimeout(() => {
            item.classList.add('gravity-drop');
            item.addEventListener('animationend', () => {
                pending--;
                if (pending === 0) {
                    dbDeleteCompleted();
                    todos = todos.filter(t => !t.done);
                    renderList();
                }
            }, { once: true });
        }, i * 80);
    });
});

/* ---- BOARD VIEW ---- */
const columns = boardViewEl.querySelectorAll('.board-column-body');
let draggedId = null;

function renderBoard() {
    const groups = { backlog: [], 'in-progress': [], done: [] };
    todos.filter(t => !t.archived).forEach(t => {
        if (groups[t.status]) groups[t.status].push(t);
        else groups.backlog.push(t);
    });

    document.getElementById('countBacklog').textContent  = groups.backlog.length;
    document.getElementById('countProgress').textContent = groups['in-progress'].length;
    document.getElementById('countDone').textContent     = groups.done.length;

    columns.forEach(col => {
        const status = col.dataset.status;
        const items = groups[status] || [];
        col.innerHTML = '';

        if (items.length === 0) {
            col.innerHTML = '<div class="board-empty">No tasks</div>';
            return;
        }

        items.forEach(todo => {
            const card = document.createElement('div');
            const isExpanded = expandedId === todo.id;
            const isEditing = editingId === todo.id;
            card.className = 'board-card' + (isExpanded ? ' expanded' : '');
            card.draggable = !isExpanded;
            card.dataset.id = todo.id;

            const statusOptions = Object.entries(STATUS_LABELS)
                .map(([val, label]) => `<option value="${val}"${val === todo.status ? ' selected' : ''}>${label}</option>`)
                .join('');

            const titleHtml = isEditing
                ? `<input class="title-edit" value="${escapeHtml(todo.text)}" data-id="${todo.id}">`
                : `<span class="card-text">${renderPriorityDot(todo)}${escapeHtml(todo.text)}</span>`;

            const notesPreview = !isExpanded && todo.notes
                ? `<span class="card-notes-preview">${escapeHtml(todo.notes.slice(0, 60))}${todo.notes.length > 60 ? '\u2026' : ''}</span>`
                : '';

            const boardTodayStr = getTodayStr();
            const boardFocused = todo.focusDate === boardTodayStr;
            const boardFocusBtn = !todo.done
                ? `<button class="focus-btn${boardFocused ? ' active' : ''}" data-id="${todo.id}" title="${boardFocused ? 'Remove from focus' : 'Focus today'}">🎯</button>`
                : '';

            card.innerHTML = `
                <div class="card-body" data-id="${todo.id}">
                    ${titleHtml}
                    ${!isExpanded ? renderLabelsRow(todo) : ''}
                    ${!isExpanded ? renderMetaChips(todo) : ''}
                    ${notesPreview}
                    ${isExpanded ? renderExpandedPanel(todo) : ''}
                </div>
                ${boardFocusBtn}
                <select class="status-select" data-id="${todo.id}">${statusOptions}</select>
                <button class="delete-btn" data-id="${todo.id}">&times;</button>
            `;

            if (!isExpanded) {
                card.addEventListener('dragstart', onDragStart);
                card.addEventListener('dragend', onDragEnd);
            }

            col.appendChild(card);

            if (isExpanded) wireExpandedPanel(card, todo, () => renderBoard());
            if (isEditing) wireTitleEdit(card, todo, () => renderBoard());
        });
    });
}

/* ---- DESKTOP DRAG & DROP ---- */
function onDragStart(e) {
    draggedId = Number(e.currentTarget.dataset.id);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedId);
}

function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedId = null;
    columns.forEach(col => col.classList.remove('drag-over'));
}

columns.forEach(col => {
    col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', e => {
        if (!col.contains(e.relatedTarget)) {
            col.classList.remove('drag-over');
        }
    });

    col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');

        const id = Number(e.dataTransfer.getData('text/plain'));
        const newStatus = col.dataset.status;
        const todo = todos.find(t => t.id === id);
        if (!todo || todo.status === newStatus) return;

        todo.status = newStatus;
        todo.done = newStatus === 'done';
        dbSaveTodo(todo);
        renderBoard();
    });
});

/* ---- BOARD EVENTS ---- */
boardViewEl.addEventListener('click', e => {
    if (e.target.closest('.expanded-panel') || e.target.closest('.title-edit')) return;

    const boardFocusBtn = e.target.closest('.focus-btn');
    if (boardFocusBtn) {
        const id = Number(boardFocusBtn.dataset.id);
        const todo = todos.find(t => t.id === id);
        if (!todo) return;
        const today = getTodayStr();
        todo.focusDate = todo.focusDate === today ? null : today;
        dbSaveTodo(todo);
        renderBoard();
        return;
    }

    const cardBody = e.target.closest('.card-body');
    if (cardBody) {
        const id = Number(cardBody.dataset.id);
        clearTimeout(expandClickTimer);
        expandClickTimer = setTimeout(() => {
            expandClickTimer = null;
            expandedId = expandedId === id ? null : id;
            editingId = null;
            renderBoard();
        }, 250);
        return;
    }

    const deleteBtn = e.target.closest('.delete-btn');
    if (!deleteBtn) return;

    const id = Number(deleteBtn.dataset.id);
    const card = deleteBtn.closest('.board-card');
    card.style.transition = 'opacity 0.25s, transform 0.25s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';

    setTimeout(() => {
        todos = todos.filter(t => t.id !== id);
        dbDeleteTodo(id);
        renderBoard();
    }, 250);
});

boardViewEl.addEventListener('dblclick', e => {
    const textEl = e.target.closest('.card-text');
    if (!textEl) return;
    clearTimeout(expandClickTimer);
    expandClickTimer = null;
    const cardBody = textEl.closest('.card-body');
    if (!cardBody) return;
    editingId = Number(cardBody.dataset.id);
    renderBoard();
});

boardViewEl.addEventListener('change', e => {
    const select = e.target.closest('.status-select');
    if (!select) return;

    const id = Number(select.dataset.id);
    const newStatus = select.value;
    const todo = todos.find(t => t.id === id);
    if (!todo || todo.status === newStatus) return;

    todo.status = newStatus;
    todo.done = newStatus === 'done';
    dbSaveTodo(todo);
    renderBoard();
});

/* ---- FOCUS VIEW ---- */
function renderFocus() {
    const today = getTodayStr();
    const focusTasks = todos.filter(t =>
        !t.done && !t.archived && (
            (t.dueDate && t.dueDate <= today) ||
            t.focusDate === today
        )
    );

    focusViewEl.innerHTML = '';

    if (focusTasks.length === 0) {
        focusViewEl.innerHTML = `
            <div class="focus-empty">
                <p>Nothing to focus on today.</p>
                <p class="focus-hint">Tasks due today (or overdue), plus any marked with 🎯, will appear here.</p>
            </div>`;
        return;
    }

    const header = `<div class="focus-header"><span class="focus-count">${focusTasks.length} task${focusTasks.length === 1 ? '' : 's'} for today</span></div>`;

    const items = focusTasks.map(todo => {
        const isExpanded = expandedId === todo.id;
        const isEditing = editingId === todo.id;

        const titleHtml = isEditing
            ? `<input class="title-edit" value="${escapeHtml(todo.text)}" data-id="${todo.id}">`
            : `<span class="text">${renderPriorityDot(todo)}${escapeHtml(todo.text)}</span>`;

        const duePart = todo.dueDate
            ? `<span class="due-chip${getDueDateState(todo) ? ` due-${getDueDateState(todo)}` : ''}">${formatDueDate(todo.dueDate)}</span>`
            : '';

        return `
            <div class="focus-item${isExpanded ? ' expanded' : ''}" data-id="${todo.id}">
                <div class="checkbox" data-id="${todo.id}"></div>
                <div class="focus-content" data-id="${todo.id}">
                    ${titleHtml}
                    ${isExpanded ? renderExpandedPanel(todo) : ''}
                </div>
                ${duePart}
                <button class="delete-btn" data-id="${todo.id}">&times;</button>
            </div>`;
    }).join('');

    focusViewEl.innerHTML = header + items;

    focusTasks.forEach(todo => {
        const el = focusViewEl.querySelector(`.focus-item[data-id="${todo.id}"]`);
        if (!el) return;
        if (expandedId === todo.id) wireExpandedPanel(el, todo, () => renderFocus());
        if (editingId === todo.id) wireTitleEdit(el, todo, () => renderFocus());
    });
}

focusViewEl.addEventListener('click', e => {
    if (e.target.closest('.expanded-panel') || e.target.closest('.title-edit')) return;

    const checkbox = e.target.closest('.checkbox');
    const deleteBtn = e.target.closest('.delete-btn');
    const content = e.target.closest('.focus-content');

    if (content) {
        const id = Number(content.dataset.id);
        clearTimeout(expandClickTimer);
        expandClickTimer = setTimeout(() => {
            expandClickTimer = null;
            expandedId = expandedId === id ? null : id;
            editingId = null;
            renderFocus();
        }, 250);
        return;
    }

    if (checkbox) {
        const id = Number(checkbox.dataset.id);
        const todo = todos.find(t => t.id === id);
        if (!todo) return;
        todo.done = true;
        todo.status = 'done';
        dbSaveTodo(todo);
        renderFocus();
    }

    if (deleteBtn) {
        const id = Number(deleteBtn.dataset.id);
        todos = todos.filter(t => t.id !== id);
        dbDeleteTodo(id);
        renderFocus();
    }
});

focusViewEl.addEventListener('dblclick', e => {
    const textEl = e.target.closest('.text');
    if (!textEl) return;
    clearTimeout(expandClickTimer);
    expandClickTimer = null;
    const content = textEl.closest('.focus-content');
    if (!content) return;
    editingId = Number(content.dataset.id);
    renderFocus();
});

/* ---- ADD TODO ---- */
async function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;

    todoInput.value = '';
    todoInput.focus();

    const row = { text, done: false, status: 'backlog', notes: '', due_date: null, subtasks: [], labels: [], priority: 'low', focus_date: null, archived: false };
    const newTodo = await dbInsertTodo(row);
    if (!newTodo) return;

    todos.unshift(newTodo);
    if (currentView === 'list') renderList();
    else if (currentView === 'board') renderBoard();
    else renderFocus();
}

addBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

/* ---- LOCATION PROMPT ---- */
document.getElementById('locationSet')?.addEventListener('click', async () => {
    const q = document.getElementById('locationInput').value.trim();
    if (!q) return;
    const loc = await searchCity(q);
    if (loc) {
        await loadWeather(loc);
        document.getElementById('locationPrompt').style.display = 'none';
        if (currentView === 'list') renderList(true);
        else if (currentView === 'board') renderBoard();
        else renderFocus();
    }
});

document.getElementById('locationInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('locationSet').click();
});

document.getElementById('locationDismiss')?.addEventListener('click', () => {
    document.getElementById('locationPrompt').style.display = 'none';
});

/* ---- INIT ---- */
async function init() {
    await dbArchiveSweep();
    await dbClearStaleFocusDates();

    const [loadedTodos] = await Promise.all([dbLoadTodos(), loadHolidays()]);
    todos = loadedTodos;
    setView(currentView);

    const location = await loadLocation();
    if (location) {
        await loadWeather(location);
        if (currentView === 'list') renderList(true);
        else if (currentView === 'board') renderBoard();
        else renderFocus();
    } else {
        const prompt = document.getElementById('locationPrompt');
        if (prompt) prompt.style.display = '';
    }
}

init();
