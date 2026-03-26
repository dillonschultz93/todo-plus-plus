import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const ARCHIVE_DAYS = 14;

export function toDbRow(todo) {
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

export function fromDbRow(row) {
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

export async function dbSaveTodo(todo) {
    const { error } = await supabase.from('todos').update(toDbRow(todo)).eq('id', todo.id);
    if (error) console.error('Failed to save todo:', error);
}

export async function dbDeleteTodo(id) {
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) console.error('Failed to delete todo:', error);
}

export async function dbDeleteCompleted() {
    const { error } = await supabase.from('todos').delete().eq('done', true).eq('archived', false);
    if (error) console.error('Failed to clear completed:', error);
}

export async function dbInsertTodo(fields) {
    const { data, error } = await supabase
        .from('todos')
        .insert(fields)
        .select()
        .single();
    if (error) { console.error('Failed to add todo:', error); return null; }
    return fromDbRow(data);
}

export async function dbLoadTodos() {
    const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) { console.error('Failed to load todos:', error); return []; }
    return data.map(fromDbRow);
}

export function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export async function dbArchiveSweep() {
    const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 86400000).toISOString();
    const { error } = await supabase
        .from('todos')
        .update({ archived: true })
        .eq('done', false)
        .eq('archived', false)
        .lt('updated_at', cutoff);
    if (error) console.error('Archive sweep failed:', error);
}

export async function dbClearStaleFocusDates() {
    const today = getTodayStr();
    const { error } = await supabase
        .from('todos')
        .update({ focus_date: null })
        .not('focus_date', 'is', null)
        .lt('focus_date', today);
    if (error) console.error('Focus date cleanup failed:', error);
}
