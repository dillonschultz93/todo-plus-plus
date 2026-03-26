import { dbSaveTodo } from './db.js';
import { getWeatherForDate, getWeatherIcon, getHolidayForDate } from './weather.js';

/* ---- CONSTANTS ---- */
export const PRIORITY_LEVELS = ['urgent', 'high', 'medium', 'low'];
export const PRIORITY_LABELS = { urgent: 'U', high: 'H', medium: 'M', low: 'L' };
export const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: 'var(--text-tertiary)' };
export const STATUS_LABELS = { 'backlog': 'Backlog', 'in-progress': 'In Progress', 'done': 'Done' };

/* ---- LABEL COLORS ---- */
const COLOR_PALETTE = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];
const LABEL_COLORS_KEY = 'todopp-label-colors';
let labelColors = JSON.parse(localStorage.getItem(LABEL_COLORS_KEY) || '{}');

function saveLabelColors() {
    localStorage.setItem(LABEL_COLORS_KEY, JSON.stringify(labelColors));
}

export function getLabelColor(name) {
    if (!labelColors[name]) {
        const used = new Set(Object.values(labelColors));
        labelColors[name] = COLOR_PALETTE.find(c => !used.has(c))
            || COLOR_PALETTE[Object.keys(labelColors).length % COLOR_PALETTE.length];
        saveLabelColors();
    }
    return labelColors[name];
}

/* ---- UTILITIES ---- */
export function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

export function getDueDateState(todo) {
    if (!todo.dueDate || todo.done) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(todo.dueDate + 'T00:00:00');
    const diff = Math.floor((due - today) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    return 'upcoming';
}

export function formatDueDate(dateStr) {
    const due = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((due - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---- COMPONENT RENDERERS ---- */
export function renderPriorityDot(todo) {
    if (todo.priority === 'low') return '';
    return `<span class="priority-dot" style="--priority-color:${PRIORITY_COLORS[todo.priority]}" title="${todo.priority}"></span>`;
}

export function renderPrioritySelector(todo) {
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

export function renderLabelsRow(todo) {
    if (!todo.labels.length) return '';
    const chips = todo.labels.map(l =>
        `<span class="label-chip" style="--label-color:${getLabelColor(l)}">${escapeHtml(l)}</span>`
    ).join('');
    return `<div class="labels-row">${chips}</div>`;
}

export function renderMetaChips(todo) {
    const parts = [];
    if (todo.dueDate) {
        const state = getDueDateState(todo);
        const cls = state ? ` due-${state}` : '';
        const weather = getWeatherForDate(todo.dueDate);
        const weatherHtml = weather
            ? ` <span class="weather-info">${getWeatherIcon(weather.code)} ${weather.hi}\u00b0</span>`
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

export function renderExpandedPanel(todo) {
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

/* ---- EVENT WIRING ---- */
let notesSaveTimer = null;

export function wireExpandedPanel(container, todo, renderFn) {
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

export function wireTitleEdit(container, todo, onDone) {
    const inp = container.querySelector('.title-edit');
    if (!inp) return;
    inp.focus();
    inp.select();

    const commit = () => {
        const val = inp.value.trim();
        if (val && val !== todo.text) { todo.text = val; dbSaveTodo(todo); }
        onDone();
    };

    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') onDone();
    });
}
