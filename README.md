# Todo++

A minimal, physics-driven todo app built for deep focus. No clutter, no noise — just you and your next task.

## Features

- **Gravity Drop** — completed tasks fall away with physics-based animation
- **Dark / Light mode** — seamless theme toggle, preference saved locally
- **Micro-interactions** — satisfying hover effects, check-mark pops, and animated transitions
- **Local-only storage** — tasks persist in `localStorage`, no accounts or servers
- **Zero config** — open it and start typing

## Getting Started

```bash
npm install
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173`).

## Scripts

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR     |
| `npm run build`   | Build for production into `dist/`      |
| `npm run preview` | Preview the production build locally   |

## Project Structure

```
├── index.html    ← Entry point
├── styles.css    ← All styles, theme variables, animations
├── app.js        ← Todo logic, theme toggle, scroll observer
├── package.json
└── README.md
```

## Tech

Vanilla HTML, CSS, and JavaScript. [Vite](https://vite.dev/) for local development and builds.
