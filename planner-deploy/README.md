# Michael's Planner — Netlify + Notion Setup

## Deploy in 4 minutes

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Planner v1"
git remote add origin https://github.com/YOUR_USERNAME/planner.git
git push -u origin main
```

### Step 2 — Deploy on Netlify
1. [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Select your repo — build settings are auto-read from `netlify.toml`
3. Click **Deploy site** (takes ~30 seconds)

### Step 3 — Create a Notion Integration
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. **New integration** → name it anything (e.g. "Planner")
3. Copy the **Internal Integration Secret** (starts with `secret_...`)

### Step 4 — Connect Integration to your To Do's database
1. In Notion, open your **Student Dashboard → To Do's** database
2. Click **···** (top right) → **Connections** → search and add your integration

### Step 5 — Add Environment Variables on Netlify
**Site Configuration → Environment variables → Add variable:**

| Key | Value |
|-----|-------|
| `NOTION_TOKEN` | `secret_xxxxxxxxxxxxxxxxxxxx` |
| `NOTION_DATABASE_ID` | `24df8257bb1581908084ec8bde52cf72` |

Then: **Deploys → Trigger deploy → Deploy site**

---

## How it works
- **Auto-imports** on every page load: only "Not started" and "In progress" tasks
- **Marking tasks** In progress or Done on the website **instantly updates Notion** too
- New tasks you create on the website are **pushed to Notion** automatically
- Tasks marked Done in Notion disappear from the website on next sync

## Schedule logic
| Time | Status |
|------|--------|
| 5:00–9:00 AM | Before school — plannable |
| 9:00–11:10 AM | School — locked |
| 11:10 AM–12:10 PM | Study hall — plannable (purple) |
| 12:10–4:00 PM | School — locked |
| 4:00 PM–2:00 AM | After school — plannable |
| **Weekends** | **Full day plannable (6 AM–2 AM)** |

## Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| `⌘K` | New task |
| `⌘→` | Next day in schedule |
| `⌘←` | Previous day in schedule |
| `Esc` | Close any modal |
