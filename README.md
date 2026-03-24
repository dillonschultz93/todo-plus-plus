# Todo++

A full-featured task management app with a kanban board, priority system, and Supabase backend. Minimal, focused, and built for getting things done.

## Features

- **List + Kanban board** — toggle between a filtered list and a drag-and-drop board with Backlog, In Progress, and Done columns
- **Priority levels** — Urgent, High, Medium, Low with color-coded dots and a filterable priority bar
- **Due dates** — date picker with color-coded chips (overdue, today, upcoming)
- **Subtasks** — checklist inside each task with a progress indicator
- **Labels** — colored chips with auto-assigned palette, persisted across sessions
- **Inline editing** — double-click any task title to rename it
- **Notes** — expandable notes section on each task
- **Weather forecasts** — 16-day weather shown on due date chips via Open-Meteo (free, no key)
- **Public holidays** — holiday badges on due dates via Nager.Date (free, no key)
- **Dark / Light mode** — theme toggle with smooth transitions
- **Gravity Drop** — completed and deleted tasks fall away with physics-based animation
- **Mobile-first** — responsive design with touch-friendly interactions
- **Supabase backend** — all tasks stored in Postgres, survives browser clears and works across devices

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Supabase](https://supabase.com/) project

### Setup

```bash
git clone https://github.com/dillonschultz93/todo-plus-plus.git
cd todo-plus-plus
npm install
```

Create a `.env` file with your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start the dev server:

```bash
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173`).

### Database

The app expects a `todos` table in your Supabase project. If you're starting fresh, run the migrations via the Supabase MCP server or apply them manually from the Supabase dashboard.

## Scripts

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR     |
| `npm run build`   | Build for production into `dist/`      |
| `npm run preview` | Preview the production build locally   |

## Project Structure

```
├── index.html        ← Entry point and app layout
├── styles.css        ← All styles, theme variables, animations
├── app.js            ← App logic, Supabase client, renderers
├── .env              ← Supabase credentials (not committed)
├── package.json
└── README.md
```

## Tech

- Vanilla HTML, CSS, and JavaScript
- [Vite](https://vite.dev/) for local development and builds
- [Supabase](https://supabase.com/) for Postgres database (with Row Level Security)
- [Open-Meteo](https://open-meteo.com/) for weather forecasts (free, no API key)
- [Nager.Date](https://date.nager.at/) for public holiday data (free, no API key)
