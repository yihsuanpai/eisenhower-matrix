# ✦ Eisenhower Matrix

> *Because your brain deserves a better operating system.*

A single-file, zero-dependency, local-first productivity tool built around the Eisenhower Decision Matrix — the same prioritisation framework used by US presidents, Fortune 500 executives, and every high-functioning person who's ever stared down an inbox and survived.

No subscriptions. No accounts. No tracking. Just you, your tasks, and brutal clarity about what actually matters.

**→ [Launch App](https://yihsuanpai.github.io/eisenhower-matrix/)**

---

## What is the Eisenhower Matrix?

The matrix splits every task into four quadrants by two axes — **urgency** and **importance**:

|                  | **Urgent →**            | **Not Urgent**            |
|------------------|-------------------------|---------------------------|
| **Important ↑**  | 🔴 **DO** — right now   | 🔵 **SCHEDULE** — plan it |
| **Not Important**| 🟡 **DELEGATE** — offload it | ⚫ **ELIMINATE** — delete it |

The insight is deceptively simple: most people spend their days reacting to urgent-but-unimportant noise. The matrix forces you to stop, zoom out, and act on what *actually* moves the needle.

---

## Features

### 🎯 Free-Float Matrix Canvas
Drag tasks to any position on the canvas — their exact coordinates represent their urgency (x-axis) and importance (y-axis). No snapping, no rigid boxes. A task that's 80% urgent and 60% important sits *exactly* there, visually.

### ✦ Today's Sprint Tab
Commit to what you're actually finishing today. Pick tasks from your active list, reorder them by priority with drag-and-drop, and close the day with a summary of what you shipped — including a completion rate and praise for clearing anything from the DO quadrant. Unfinished tasks carry forward automatically.

### 🌙 End-of-Day Summary
When you're done, hit *Call it a day*. The app shows you: how many tasks you committed to, how many you finished, what's still open, and — if you cleared any high-importance work — a well-earned compliment.

### 📋 Sortable Active Task Table
Every column in the Active tab is sortable: task name, quadrant, urgency score, importance score, creation date, deadline. One click to sort, one more to reverse.

### 📅 Deadline Countdown Bar
Set a hard deadline on any task. As it approaches, a live countdown bar appears at the top of the matrix — hours, minutes, seconds — so nothing sneaks up on you.

### 🗒 Notes Per Task
Every task supports rich freeform notes. Add a note icon appears on hover across both the matrix canvas and the table view. Notes are searchable and previewed on hover.

### 😮‍💨 Mood Check-Ins
Feeling drained? Hit the mood button (*I'm bored / I'm tired / I'm exhausted / I'm drained*). A Marcus Aurelius quote appears, followed by a witty-but-wise nudge to step away for three minutes — then come back and start a specific task from your DO quadrant.

### 🎨 City-Pop Aesthetic
Dark-mode base built on deep space blue and midnight indigo, lit up with cyber magenta, electric aqua, hot pink, and neon lime accents. Designed to feel like a premium productivity tool, not an enterprise JIRA clone.

### 🔒 Fully Local — No Server, No Sync, No Tracking
All data lives in your browser's `localStorage`. Nothing is sent anywhere. The app is a single `.html` file — the entire product, zero build step, zero dependencies, zero cloud costs.

---

## Stack

```
HTML + CSS + Vanilla JS   (1 file, ~2,400 lines)
localStorage              (persistence)
GitHub Pages              (hosting)
```

No React. No Node. No bundler. No npm install. Deliberately.

The constraint of a single file isn't a limitation — it's a design choice. When your entire product fits in one file, you think very carefully about what belongs in it.

---

## Run it Locally

```bash
# Option A: just open it
open eisenhower.html

# Option B: serve it (avoids any file:// quirks)
python3 -m http.server 8080
# → http://localhost:8080/eisenhower.html
```

---

## Deploy Your Own Copy

```bash
# 1. Get a GitHub token at https://github.com/settings/tokens (tick 'repo')
# 2. Run:
GITHUB_TOKEN=ghp_yourtoken python3 deploy.py
# → Publishes to https://yourusername.github.io/eisenhower-matrix/
```

---

## Data & Privacy

Your tasks, notes, and name are stored **only in your browser's localStorage**. They are never sent to GitHub, any server, or anywhere else. Publishing this repo makes the *source code* public — not your data. Think of it as open-sourcing a blank notebook.

To back up your data: click the 📋 **Copy Data** button in the app. To restore: click 📥 **Import Data**.

---

## Version

`Ver. 1.0.0` — Built with [Claude Sonnet 4.6](https://www.anthropic.com/claude)  
**Builder:** Angela Pai

---

*Built because good tools should feel as sharp as the thinking they support.*
