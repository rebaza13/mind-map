import { useState } from 'react'
import Icon from './Icon'

// Ready-made starting points. Each outline is the same indented format the text bar accepts.
const TEMPLATES = [
  { emoji: '🚀', name: 'Launch a project', outline: '- Goals\n  - Success looks like\n  - Deadline\n- Plan\n  - Research\n  - Design\n  - Build\n- Launch\n  - Announce\n  - Collect feedback' },
  { emoji: '✈️', name: 'Plan a trip', outline: '- Before\n  - Book flights\n  - Book stay\n  - Documents\n- Packing\n  - Clothes\n  - Chargers\n- Places to see\n- Budget' },
  { emoji: '📚', name: 'Study plan', outline: '- Topics\n  - Basics\n  - Practice problems\n  - Revision\n- Schedule\n  - Daily sessions\n  - Mock exam\n- Resources' },
  { emoji: '🗓️', name: 'This week', outline: '- Work\n  - Top priority\n  - Meetings\n- Home\n  - Errands\n  - Bills\n- Health\n  - Workout\n  - Sleep early' },
]

export default function Welcome({ firstTime, onCreate }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (fn) => { if (busy) return; setBusy(true); try { await fn() } finally { setBusy(false) } }
  const name = text.trim()

  return (
    <div className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-card">
        <svg className="welcome-art" viewBox="0 0 220 120" aria-hidden>
          <g fill="none" strokeWidth="3" strokeLinecap="round" opacity="0.7">
            <path d="M110 60 C 80 60, 70 28, 40 28" stroke="#38e1c6" />
            <path d="M110 60 C 80 60, 70 92, 40 92" stroke="#ff7ab8" />
            <path d="M110 60 C 140 60, 150 28, 180 28" stroke="#ffc857" />
            <path d="M110 60 C 140 60, 150 92, 180 92" stroke="#6bb6ff" />
          </g>
          <circle cx="40" cy="28" r="10" fill="#38e1c6" className="bud b1" />
          <circle cx="40" cy="92" r="10" fill="#ff7ab8" className="bud b2" />
          <circle cx="180" cy="28" r="10" fill="#ffc857" className="bud b3" />
          <circle cx="180" cy="92" r="10" fill="#6bb6ff" className="bud b4" />
          <circle cx="110" cy="60" r="20" fill="#7c5cff" />
          <path d="M110 50l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6z" fill="#fff" />
        </svg>
        <h1>{firstTime ? 'Welcome to Mindbloom' : 'A fresh start'}</h1>
        <p>{firstTime ? 'Turn ideas into a colourful map of tasks.' : 'You have no maps here yet.'} What do you want to work on?</p>

        <form className="welcome-ask" onSubmit={(e) => { e.preventDefault(); name && go(() => onCreate(name)) }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Open a coffee shop" maxLength={120} />
          <button type="submit" className="soft-btn" disabled={!name || busy}><Icon name="plus" size={16} /> Blank map</button>
          <button type="button" className="ai-btn" disabled={!name || busy} title="Create the map and let AI fill in the branches"
            onClick={() => go(() => onCreate(name, { prompt: `Build a complete, well-organised plan for: ${name}` }))}>
            <Icon name="spark" size={16} /> Build with AI
          </button>
        </form>

        <div className="welcome-sub">or start from a template</div>
        <div className="templates">
          {TEMPLATES.map((t) => (
            <button key={t.name} disabled={busy} onClick={() => go(() => onCreate(t.name, { outline: t.outline }))}>
              <span className="emoji">{t.emoji}</span>
              <b>{t.name}</b>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
