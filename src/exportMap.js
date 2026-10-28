import { NODE_H, childrenMap, nodeW } from './tree'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Builds one standalone HTML page: the map as inline SVG plus the to-do outline.
export function buildHtml(name, nodes, pos) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of nodes) {
    const p = pos.get(n.id)
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y)
    x2 = Math.max(x2, p.x + nodeW(n)); y2 = Math.max(y2, p.y + NODE_H)
  }
  const pad = 30
  const links = nodes.filter((n) => n.parent_id && byId.has(n.parent_id)).map((n) => {
    const p = byId.get(n.parent_id), a = pos.get(p.id), b = pos.get(n.id)
    const sx = a.x + nodeW(p), sy = a.y + NODE_H / 2, ex = b.x, ey = b.y + NODE_H / 2
    const c = Math.max(40, (ex - sx) / 2)
    return `<path d="M${sx} ${sy} C${sx + c} ${sy},${ex - c} ${ey},${ex} ${ey}" stroke="${n.color}" stroke-width="3" fill="none"/>`
  }).join('')
  const boxes = nodes.map((n) => {
    const p = pos.get(n.id)
    return `<g opacity="${n.done ? 0.55 : 1}"><rect x="${p.x}" y="${p.y}" width="${nodeW(n)}" height="${NODE_H}" rx="23" fill="${n.color}" fill-opacity="0.2" stroke="${n.color}" stroke-width="2"/>` +
      `<text x="${p.x + 18}" y="${p.y + 28}" font-size="15" fill="#1c1a33"${n.done ? ' text-decoration="line-through"' : ''}>${esc(n.title.slice(0, 30))}</text></g>`
  }).join('')

  const kids = childrenMap(nodes)
  const list = (parent) => {
    const c = kids.get(parent) || []
    return c.length ? `<ul>${c.map((n) => `<li><span style="color:${n.color}">${n.done ? '☑' : '☐'}</span> ${n.done ? '<s>' + esc(n.title) + '</s>' : esc(n.title)}${n.notes ? `<small>${esc(n.notes)}</small>` : ''}${list(n.id)}</li>`).join('')}</ul>` : ''
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>
body{font-family:system-ui,sans-serif;color:#1c1a33;margin:32px;background:#fff}h1{margin:0 0 16px}
svg{width:100%;height:auto;border:1px solid #ddd8f5;border-radius:12px;background:#fbfaff}
ul{list-style:none;padding-left:22px}li{margin:4px 0}small{display:block;color:#6c6a8a;white-space:pre-wrap}
@media print{body{margin:12mm}}</style></head><body><h1>${esc(name)}</h1>
<svg viewBox="${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">${links}${boxes}</svg>
<h2>Outline</h2>${list(null)}</body></html>`
}

export function downloadHtml(name, nodes, pos) {
  const url = URL.createObjectURL(new Blob([buildHtml(name, nodes, pos)], { type: 'text/html' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/\W+/g, '-')}.html` })
  a.click()
  URL.revokeObjectURL(url)
}

// PDF: open the page and use the browser's "Save as PDF" print destination.
export function printPdf(name, nodes, pos) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(buildHtml(name, nodes, pos))
  w.document.close()
  w.onload = () => w.print()
  setTimeout(() => w.print(), 400)
  return true
}
