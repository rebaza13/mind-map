# Mindbloom

A private, colourful mind map + to-do tree. React + Vite (client-side only) with Supabase for auth and storage.

- **Login**: Google, or email/password. Signed in for 7 days, then asks again. Row-level security means each person only ever sees their own maps.
- **Map view**: drag nodes (a branch moves together), pan, zoom, click a node to edit colour/notes, `+` to add a subtask, `Tab` adds a subtask, `Delete` removes.
- **To-do view**: the same tree as a checklist with progress bars.
- **Text command bar**: type or paste text and it grows the selected node. Examples: `Launch: Design, Build > Frontend, Backend`, indented/bulleted outlines, `done Build`, `delete Ship`.
- **AI chats**: a list of chat sessions/projects stored in Supabase; click one to add it to the map as a node.

## Run
```
cp .env.example .env   # fill in the Supabase URL + publishable key
npm install
npm run dev
```
Database schema lives in `supabase/migrations`.

## Text format (paste an AI's answer into the bottom bar)
Indented bullets, 2 spaces per level:
```
- Launch website
  - Design
    - Logo
  - Build
```
Also accepted: `Parent: child, child`, `A > B > C`, `done <title>`, `delete <title>`. The **AI prompt** button copies a ready-made prompt for any AI.
