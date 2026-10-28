export const PALETTE = ['#7c5cff', '#38e1c6', '#ff7ab8', '#ffc857', '#6bb6ff', '#ff8a5c', '#a3e635', '#c084fc']
// Each new sibling steps one colour further round the palette, starting from the parent's colour.
export const pickColor = (parent, n) => PALETTE[((parent ? Math.max(0, PALETTE.indexOf(parent.color)) + 1 : 0) + n) % PALETTE.length]
export const NODE_H = 46
const GAP_Y = 70
const GAP_X = 90

export const nodeW = (n) => Math.min(260, Math.max(120, n.title.length * 8.2 + 64))

export function childrenMap(nodes) {
  const m = new Map()
  for (const n of nodes) {
    const k = n.parent_id ?? null
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(n)
  }
  for (const list of m.values()) list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  return m
}

// Left-to-right tree layout. Nodes the user dragged keep their saved x/y.
export function layout(nodes) {
  const kids = childrenMap(nodes)
  const auto = new Map()
  let row = 0
  const place = (n, x) => {
    const c = kids.get(n.id) || []
    let y
    if (!c.length) y = row++ * GAP_Y
    else {
      c.forEach((ch) => place(ch, x + nodeW(n) + GAP_X))
      y = (auto.get(c[0].id).y + auto.get(c[c.length - 1].id).y) / 2
    }
    auto.set(n.id, { x, y })
  }
  ;(kids.get(null) || []).forEach((r) => place(r, 0))
  const pos = new Map()
  for (const n of nodes) {
    const a = auto.get(n.id) || { x: 0, y: 0 }
    pos.set(n.id, { x: n.x ?? a.x, y: n.y ?? a.y })
  }
  return pos
}

export function descendants(nodes, id) {
  const kids = childrenMap(nodes)
  const out = []
  const walk = (i) => (kids.get(i) || []).forEach((c) => (out.push(c.id), walk(c.id)))
  walk(id)
  return out
}

export function progress(nodes, id) {
  const ids = descendants(nodes, id)
  if (!ids.length) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const done = ids.filter((i) => byId.get(i).done).length
  return { done, total: ids.length }
}

// ---- text -> outline -------------------------------------------------------
// Accepts indented bullet lists, "Parent: a, b, c" and "A > B > C" chains.
export function parseOutline(text) {
  const items = []
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indent = raw.match(/^[\t ]*/)[0].replace(/\t/g, '  ').length
    const base = Math.floor(indent / 2)
    const line = raw.trim().replace(/^([-*•]|\d+[.)])\s+/, '')
    const chain = line.replace(/:\s+|:(?=\S)/g, '>').split('>')
    chain.forEach((seg, i) => {
      seg.split(',').map((p) => p.trim()).filter(Boolean).forEach((title) => items.push({ title, depth: base + i }))
    })
  }
  return items
}

// Paste this into any AI chat; whatever it answers can be pasted straight into the Mindbloom text bar.
export const AI_PROMPT = `Make me a mind map about: [YOUR TOPIC HERE]

Reply with ONLY an indented bullet list inside a code block, nothing else. Rules:
- One idea per line, starting with "- ".
- Indent children by exactly 2 spaces under their parent.
- Keep each title short (2-6 words).
- 4-7 main branches, each with 2-5 subtasks.

Example:
- Launch website
  - Design
    - Logo
    - Colours
  - Build
    - Frontend
    - Backend
  - Ship`
