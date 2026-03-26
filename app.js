import './theme.js';
import {
    dbSaveTodo, dbDeleteTodo, dbDeleteCompleted, dbInsertTodo,
    dbLoadTodos, getTodayStr, dbArchiveSweep, dbClearStaleFocusDates,
} from './db.js';
import { loadLocation, searchCity, loadWeather, loadHolidays } from './weather.js';
import {
    STATUS_LABELS, escapeHtml, getDueDateState, formatDueDate,
    renderPriorityDot, renderLabelsRow, renderMetaChips,
    renderExpandedPanel, wireExpandedPanel, wireTitleEdit,
} from './renderers.js';

/* ---- STATE ---- */
const VIEW_KEY = 'todopp-view';

let todos = [];
let filter = 'all';
let priorityFilter = 'all';
let currentView = localStorage.getItem(VIEW_KEY) || 'list';
let expandedId = null;
let editingId = null;
let expandClickTimer = null;

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
        if (isEditing) wireTitleEdit(li, todo, () => { editingId = null; renderList(true); });
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
            if (isEditing) wireTitleEdit(card, todo, () => { editingId = null; renderBoard(); });
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
        if (editingId === todo.id) wireTitleEdit(el, todo, () => { editingId = null; renderFocus(); });
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
