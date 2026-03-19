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
const STORAGE_KEY = 'todopp-items';
const VIEW_KEY = 'todopp-view';
const LABEL_COLORS_KEY = 'todopp-label-colors';

let todos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

todos.forEach(t => {
    if (!t.status) t.status = t.done ? 'done' : 'backlog';
    if (t.notes === undefined) t.notes = '';
    if (t.dueDate === undefined) t.dueDate = null;
    if (!t.subtasks) t.subtasks = [];
    if (!t.labels) t.labels = [];
});

let filter = 'all';
let currentView = localStorage.getItem(VIEW_KEY) || 'list';
let expandedId = null;
let editingId = null;
let expandClickTimer = null;

const STATUS_LABELS = {
    'backlog': 'Backlog',
    'in-progress': 'In Progress',
    'done': 'Done'
};

const COLOR_PALETTE = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];
let labelColors = JSON.parse(localStorage.getItem(LABEL_COLORS_KEY) || '{}');

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

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

/* ---- SHARED RENDERERS ---- */
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
        parts.push(`<span class="due-chip${cls}">${formatDueDate(todo.dueDate)}</span>`);
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

    panel.querySelector('.notes-input')?.addEventListener('input', e => {
        todo.notes = e.target.value;
        save();
    });

    panel.querySelector('.due-input')?.addEventListener('change', e => {
        todo.dueDate = e.target.value || null;
        save();
        renderFn();
    });

    panel.querySelector('.clear-due')?.addEventListener('click', () => {
        todo.dueDate = null;
        save();
        renderFn();
    });

    panel.querySelectorAll('.subtask-checkbox').forEach(cb => {
        cb.addEventListener('click', () => {
            const sid = Number(cb.dataset.sid);
            const sub = todo.subtasks.find(s => s.id === sid);
            if (sub) { sub.done = !sub.done; save(); renderFn(); }
        });
    });

    panel.querySelectorAll('.subtask-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const sid = Number(btn.dataset.sid);
            todo.subtasks = todo.subtasks.filter(s => s.id !== sid);
            save();
            renderFn();
        });
    });

    panel.querySelector('.subtask-add')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const text = e.target.value.trim();
        if (!text) return;
        todo.subtasks.push({ id: Date.now() + Math.random(), text, done: false });
        save();
        renderFn();
    });

    panel.querySelectorAll('.label-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.dataset.label;
            todo.labels = todo.labels.filter(l => l !== label);
            save();
            renderFn();
        });
    });

    panel.querySelector('.label-add')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const label = e.target.value.trim().toLowerCase();
        if (!label || todo.labels.includes(label)) { e.target.value = ''; return; }
        todo.labels.push(label);
        getLabelColor(label);
        save();
        renderFn();
    });
}

function wireTitleEdit(container, todo, renderFn) {
    const input = container.querySelector('.title-edit');
    if (!input) return;
    input.focus();
    input.select();

    const commit = () => {
        const val = input.value.trim();
        if (val && val !== todo.text) { todo.text = val; save(); }
        editingId = null;
        renderFn();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { editingId = null; renderFn(); }
    });
}

/* ---- DOM REFS ---- */
const todoSection = document.getElementById('todoSection');
const input       = document.getElementById('todoInput');
const addBtn      = document.getElementById('addBtn');
const listViewEl  = document.getElementById('listView');
const boardViewEl = document.getElementById('boardView');
const list        = document.getElementById('todoList');
const statusBar   = document.getElementById('statusBar');
const itemCount   = document.getElementById('itemCount');
const clearBtn    = document.getElementById('clearCompleted');
const filterBtns  = document.querySelectorAll('.filters button');
const viewBtns    = document.querySelectorAll('#viewToggle button');

/* ---- VIEW SWITCHING ---- */
function setView(view) {
    currentView = view;
    localStorage.setItem(VIEW_KEY, view);
    editingId = null;

    viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));

    if (view === 'list') {
        listViewEl.style.display = '';
        boardViewEl.style.display = 'none';
        todoSection.classList.remove('board-active');
        renderList(true);
    } else {
        listViewEl.style.display = 'none';
        boardViewEl.style.display = '';
        todoSection.classList.add('board-active');
        renderBoard();
    }
}

viewBtns.forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
});

/* ---- LIST VIEW ---- */
function renderList(skipAnimation) {
    const filtered = todos.filter(t => {
        if (filter === 'active')    return !t.done;
        if (filter === 'completed') return t.done;
        return true;
    });

    list.innerHTML = '';

    if (todos.length === 0) {
        list.innerHTML = '<li class="empty-state">Nothing here yet. Add your first task above.</li>';
        statusBar.style.display = 'none';
        return;
    }

    if (filtered.length === 0) {
        const label = filter === 'active' ? 'active' : 'completed';
        list.innerHTML = `<li class="empty-state">No ${label} tasks</li>`;
    }

    filtered.forEach(todo => {
        const li = document.createElement('li');
        const isExpanded = expandedId === todo.id;
        const isEditing = editingId === todo.id;
        li.className = 'todo-item' + (todo.done ? ' completed' : '') + (isExpanded ? ' expanded' : '');
        if (skipAnimation) li.style.animation = 'none';

        const notesIndicator = todo.notes && !isExpanded ? '<span class="notes-indicator"></span>' : '';
        const statusLabel = STATUS_LABELS[todo.status] || 'Backlog';
        const dotClass = todo.status === 'done' ? 'dot-done' : todo.status === 'in-progress' ? 'dot-progress' : 'dot-backlog';

        const titleHtml = isEditing
            ? `<input class="title-edit" value="${escapeHtml(todo.text)}" data-id="${todo.id}">`
            : `<span class="text">${escapeHtml(todo.text)}${notesIndicator}</span>`;

        li.innerHTML = `
            <div class="checkbox" data-id="${todo.id}"></div>
            <div class="todo-content" data-id="${todo.id}">
                ${titleHtml}
                ${!isExpanded ? renderLabelsRow(todo) : ''}
                ${isExpanded ? renderExpandedPanel(todo) : ''}
            </div>
            ${renderMetaChips(todo)}
            <span class="status-badge"><span class="board-column-dot ${dotClass}"></span>${statusLabel}</span>
            <button class="delete-btn" data-id="${todo.id}">&times;</button>
        `;

        list.appendChild(li);

        if (isExpanded) wireExpandedPanel(li, todo, () => renderList(true));
        if (isEditing) wireTitleEdit(li, todo, () => renderList(true));
    });

    const remaining = todos.filter(t => !t.done).length;
    itemCount.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
    clearBtn.style.display = todos.some(t => t.done) ? '' : 'none';
    statusBar.style.display = '';
}

list.addEventListener('click', e => {
    if (e.target.closest('.expanded-panel') || e.target.closest('.title-edit')) return;

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
        save();

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
            save();
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

clearBtn.addEventListener('click', () => {
    const completed = list.querySelectorAll('.todo-item.completed');
    let pending = completed.length;

    if (pending === 0) {
        todos = todos.filter(t => !t.done);
        save();
        renderList();
        return;
    }

    completed.forEach((item, i) => {
        setTimeout(() => {
            item.classList.add('gravity-drop');
            item.addEventListener('animationend', () => {
                pending--;
                if (pending === 0) {
                    todos = todos.filter(t => !t.done);
                    save();
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
    todos.forEach(t => {
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
                : `<span class="card-text">${escapeHtml(todo.text)}</span>`;

            const notesPreview = !isExpanded && todo.notes
                ? `<span class="card-notes-preview">${escapeHtml(todo.notes.slice(0, 60))}${todo.notes.length > 60 ? '\u2026' : ''}</span>`
                : '';

            card.innerHTML = `
                <div class="card-body" data-id="${todo.id}">
                    ${titleHtml}
                    ${!isExpanded ? renderLabelsRow(todo) : ''}
                    ${!isExpanded ? renderMetaChips(todo) : ''}
                    ${notesPreview}
                    ${isExpanded ? renderExpandedPanel(todo) : ''}
                </div>
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
        save();
        renderBoard();
    });
});

/* ---- BOARD EVENTS ---- */
boardViewEl.addEventListener('click', e => {
    if (e.target.closest('.expanded-panel') || e.target.closest('.title-edit')) return;

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
        save();
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
    save();
    renderBoard();
});

/* ---- ADD TODO ---- */
function addTodo() {
    const text = input.value.trim();
    if (!text) return;

    todos.unshift({ id: Date.now(), text, done: false, status: 'backlog', notes: '', dueDate: null, subtasks: [], labels: [] });
    input.value = '';
    save();

    if (currentView === 'list') renderList();
    else renderBoard();

    input.focus();
}

addBtn.addEventListener('click', addTodo);
input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

/* ---- INIT ---- */
setView(currentView);
