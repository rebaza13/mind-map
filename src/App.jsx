import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, clearLogin, markLogin, sessionExpired } from './supabase'
import Login from './Login'
import MapCanvas from './MapCanvas'
import TodoView, { Avatar } from './TodoView'
import Icon from './Icon'
import { downloadHtml, printPdf } from './exportMap'
import { PALETTE, descendants, layout, nodeW, parseOutline, pickColor, AI_PROMPT } from './tree'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && sessionExpired()) {
        // Sessions older than a week must sign in again.
        supabase.auth.signOut()
        clearLogin()
        return setSession(null)
      }
      if (data.session && !localStorage.getItem('mindbloom.loginAt')) markLogin()
      setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="boot">…</div>
  return session ? <Workspace /> : <Login />
}

function Workspace() {
  const [maps, setMaps] = useState([])
  const [mapId, setMapId] = useState(null)
  const [nodes, setNodes] = useState([])
  const [sel, setSel] = useState(null)
  const [view, setView] = useState('map')
  const [toast, setToast] = useState('')
  const timers = useRef({})
  const [chatOpen, setChatOpen] = useState(false)
  const [newName, setNewName] = useState(null) // null = not creating
  const [ask, setAsk] = useState(null) // {title, body, label, onYes}
  const [renaming, setRenaming] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [thinking, setThinking] = useState(false)

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3500) }
  const fail = (error) => error && say(error.message)

  // ---- loading -----------------------------------------------------------
  const loadMaps = useCallback(async () => {
    let { data, error } = await supabase.from('maps').select('*').order('created_at')
    if (error) return say(error.message)
    if (!data.length) {
      const { data: m, error: e2 } = await supabase.from('maps').insert({ name: 'My first map' }).select().single()
      if (e2) return say(e2.message)
      await supabase.from('nodes').insert({ map_id: m.id, title: 'My mind', color: PALETTE[0] })
      data = [m]
    }
    setMaps(data)
    setMapId((cur) => cur ?? data[0].id)
  }, [])

  useEffect(() => {
    loadMaps()
  }, [loadMaps])

  useEffect(() => {
    if (!mapId) return
    setSel(null)
    supabase.from('nodes').select('*').eq('map_id', mapId).then(({ data, error }) => (fail(error), setNodes(data || [])))
  }, [mapId])

  const pos = useMemo(() => layout(nodes), [nodes])
  const selected = nodes.find((n) => n.id === sel)

  // ---- node operations (optimistic, then persisted) ----------------------
  const patchNode = (id, patch, { debounce } = {}) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    const send = () => supabase.from('nodes').update(patch).eq('id', id).then(({ error }) => fail(error))
    if (!debounce) return send()
    const k = id + Object.keys(patch).join()
    clearTimeout(timers.current[k])
    timers.current[k] = setTimeout(send, 500)
  }

  const makeNode = (parentId, title, extra = {}) => {
    const parent = nodes.find((n) => n.id === parentId)
    const siblings = nodes.filter((n) => n.parent_id === parentId)
    const roots = nodes.filter((n) => !n.parent_id).length
    const row = {
      id: crypto.randomUUID(),
      map_id: mapId,
      parent_id: parentId ?? null,
      title,
      color: parent ? pickColor(parent, siblings.length) : PALETTE[roots % PALETTE.length],
      position: siblings.length,
      created_at: new Date().toISOString(),
      notes: '',
      done: false,
      x: null,
      y: null,
      ...extra,
    }
    // A moved parent leaves its auto-layout slot, so place the new child next to it by hand.
    if (parent && parent.x != null && extra.x === undefined) {
      row.x = pos.get(parent.id).x + nodeW(parent) + 90
      row.y = pos.get(parent.id).y + siblings.length * 62
    }
    return row
  }

  const insertRows = async (rows) => {
    setNodes((ns) => [...ns, ...rows])
    const { error } = await supabase.from('nodes').insert(rows.map(({ created_at, ...r }) => r))
    if (error) { fail(error); setNodes((ns) => ns.filter((n) => !rows.some((r) => r.id === n.id))) }
  }

  const addChild = async (parentId, title = 'New subtask') => {
    const row = makeNode(parentId, title)
    await insertRows([row])
    setSel(row.id)
  }

  const removeNode = (id) => {
    const n = nodes.find((x) => x.id === id)
    if (!n) return
    if (!n.parent_id) return say('The centre of a map can’t be deleted — delete the map instead.')
    const gone = new Set([id, ...descendants(nodes, id)])
    setNodes((ns) => ns.filter((x) => !gone.has(x.id)))
    setSel(null)
    supabase.from('nodes').delete().eq('id', id).then(({ error }) => fail(error))
  }

  const moveNodes = (moves) => {
    const m = new Map(moves.map((x) => [x.id, x]))
    setNodes((ns) => ns.map((n) => (m.has(n.id) ? { ...n, x: m.get(n.id).x, y: m.get(n.id).y } : n)))
    moves.forEach(({ id, x, y }) => supabase.from('nodes').update({ x, y }).eq('id', id).then(({ error }) => fail(error)))
  }

  const toggle = (id) => {
    const n = nodes.find((x) => x.id === id)
    patchNode(id, { done: !n.done })
  }

  // ---- text command bar: outlines and quick verbs -------------------------
  const runCommand = async (text) => {
    const t = text.trim()
    if (!t) return
    const verb = t.match(/^(done|finish|delete|remove)\s+(.+)$/i)
    if (verb && !t.includes('\n')) {
      const target = nodes.find((n) => n.title.toLowerCase() === verb[2].trim().toLowerCase())
      if (!target) return say(`No node called “${verb[2]}”.`)
      return /^(done|finish)/i.test(verb[1]) ? patchNode(target.id, { done: true }) : removeNode(target.id)
    }
    const root = nodes.find((n) => !n.parent_id)
    const base = sel || root?.id
    const stack = []
    const rows = []
    const counts = new Map()
    for (const it of parseOutline(t)) {
      const d = Math.min(it.depth, stack.length)
      const parentId = d === 0 ? base : stack[d - 1]
      const parent = [...nodes, ...rows].find((n) => n.id === parentId)
      const n = (counts.get(parentId) ?? nodes.filter((x) => x.parent_id === parentId).length)
      counts.set(parentId, n + 1)
      const row = {
        id: crypto.randomUUID(), map_id: mapId, parent_id: parentId, title: it.title, notes: '', done: false, x: null, y: null,
        position: n, created_at: new Date().toISOString(),
        color: parent ? pickColor(parent, n) : PALETTE[n % PALETTE.length],
      }
      rows.push(row)
      stack[d] = row.id
      stack.length = d + 1
    }
    if (rows.length) { await insertRows(rows); say(`Added ${rows.length} node${rows.length > 1 ? 's' : ''}.`) }
  }

  // ---- Claude: send the map + message to the edge function, apply the edits it returns ----
  const askClaude = async (text) => {
    const history = msgs.map((m) => ({ role: m.role, content: m.text }))
    setMsgs((m) => [...m, { role: 'user', text }])
    setThinking(true)
    const { data, error } = await supabase.functions.invoke('claude-map', {
      body: {
        message: text,
        history,
        mapName: maps.find((m) => m.id === mapId)?.name,
        nodes: nodes.map(({ id, parent_id, title, done }) => ({ id, parent_id, title, done })),
      },
    })
    setThinking(false)
    let err = error?.message
    if (error?.context?.json) err = (await error.context.json().catch(() => null))?.error || err
    if (err) return setMsgs((m) => [...m, { role: 'assistant', text: `⚠ ${err}` }])
    await applyOps(data.ops || [])
    setMsgs((m) => [...m, { role: 'assistant', text: data.reply || 'Done.' }])
  }

  const applyOps = async (ops) => {
    const refs = new Map()
    const rows = []
    const all = () => [...nodes, ...rows]
    for (const o of ops) {
      const target = all().find((n) => n.id === (refs.get(o.id) ?? o.id))
      if (o.op === 'add') {
        const parentId = refs.get(o.id) ?? (target ? target.id : nodes.find((n) => !n.parent_id)?.id)
        const parent = all().find((n) => n.id === parentId)
        const n = all().filter((x) => x.parent_id === parentId).length
        const row = {
          id: crypto.randomUUID(), map_id: mapId, parent_id: parentId, title: o.title || 'New idea', notes: o.notes || '',
          done: false, x: null, y: null, position: n, created_at: new Date().toISOString(), color: pickColor(parent, n),
        }
        if (o.ref) refs.set(o.ref, row.id)
        rows.push(row)
      } else if (target && o.op === 'rename' && o.title) patchNode(target.id, { title: o.title })
      else if (target && o.op === 'done') patchNode(target.id, { done: o.done !== false })
      else if (target && o.op === 'notes') patchNode(target.id, { notes: o.notes || '' })
      else if (target && o.op === 'delete') removeNode(target.id)
    }
    if (rows.length) await insertRows(rows)
  }

  // ---- maps / chats --------------------------------------------------------
  const newMap = async (e) => {
    e?.preventDefault()
    const name = (newName || '').trim()
    setNewName(null)
    if (!name) return
    const { data: m, error } = await supabase.from('maps').insert({ name }).select().single()
    if (error) return fail(error)
    await supabase.from('nodes').insert({ map_id: m.id, title: name, color: PALETTE[0] })
    setMaps((ms) => [...ms, m])
    setMapId(m.id)
  }

  const deleteMap = async (id) => {
    const { error } = await supabase.from('maps').delete().eq('id', id)
    if (error) return fail(error)
    const rest = maps.filter((m) => m.id !== id)
    if (!rest.length) { // deleting the last map leaves a fresh empty one
      const { data: m } = await supabase.from('maps').insert({ name: 'My first map' }).select().single()
      await supabase.from('nodes').insert({ map_id: m.id, title: 'My mind', color: PALETTE[0] })
      setMaps([m]); setMapId(m.id); return
    }
    setMaps(rest)
    if (id === mapId) setMapId(rest[0].id)
  }

  const renameMap = async (id, name) => {
    setRenaming(null)
    const clean = name.trim()
    if (!clean) return
    setMaps((ms) => ms.map((m) => (m.id === id ? { ...m, name: clean } : m)))
    fail((await supabase.from('maps').update({ name: clean }).eq('id', id)).error)
  }

  // Keyboard: Tab adds a subtask, Delete removes the selected node.
  useEffect(() => {
    const h = (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || !sel) return
      if (e.key === 'Tab') { e.preventDefault(); addChild(sel) }
      if (e.key === 'Delete') removeNode(sel)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Mind<span>bloom</span></div>

        <button className="new-map" onClick={() => setNewName('')}><Icon name="plus" size={16} /> New map</button>
        <div className="sec-head"><h3>Your maps</h3></div>
        <div className="list">
          {newName !== null && (
            <form onSubmit={newMap}><input autoFocus placeholder="Name it, then Enter" value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => !newName.trim() && setNewName(null)} /></form>
          )}
          {maps.map((m) => (
            <div key={m.id} className={`item ${m.id === mapId ? 'on' : ''}`}>
              {renaming === m.id ? (
                <input autoFocus defaultValue={m.name} onBlur={(e) => renameMap(m.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(null) }} />
              ) : (
                <>
                  <button className="name" onClick={() => setMapId(m.id)} onDoubleClick={() => setRenaming(m.id)} title="Double-click to rename">{m.name}</button>
                  <button className="x" title="Rename" onClick={() => setRenaming(m.id)}><Icon name="pen" size={14} /></button>
                  <button className="x del" title="Delete map" onClick={() => setAsk({ title: `Delete “${m.name}”?`, body: 'Every idea and subtask in this map will be gone for good.', label: 'Delete map', onYes: () => deleteMap(m.id) })}><Icon name="trash" size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>

        <button className="signout" onClick={() => { clearLogin(); supabase.auth.signOut() }}>Sign out</button>
      </aside>

      <main className="main">
        <header className="bar">
          <h2>{maps.find((m) => m.id === mapId)?.name}</h2>
          <div className="seg">
            <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>Mind map</button>
            <button className={view === 'todo' ? 'on' : ''} onClick={() => setView('todo')}>To-do</button>
          </div>
          <button className="claude-btn" onClick={() => setChatOpen(!chatOpen)}><Icon name="spark" size={16} /> Ask Claude</button>
          <button className="ghost" onClick={() => downloadHtml(maps.find((m) => m.id === mapId)?.name || 'map', nodes, pos)}><Icon name="down" size={15} /> HTML</button>
          <button className="ghost" onClick={() => printPdf(maps.find((m) => m.id === mapId)?.name || 'map', nodes, pos) || say('Allow pop-ups to export PDF.')}><Icon name="down" size={15} /> PDF</button>
        </header>

        {view === 'map' ? (
          <MapCanvas nodes={nodes} pos={pos} sel={sel} onSelect={setSel} onMove={moveNodes} onAddChild={addChild} onToggle={toggle} />
        ) : (
          <TodoView nodes={nodes} sel={sel} onSelect={setSel} onToggle={toggle} onAddChild={addChild} onPatch={patchNode} />
        )}

        {chatOpen && <ClaudeChat msgs={msgs} thinking={thinking} onSend={askClaude} onClose={() => setChatOpen(false)} />}
        <CommandBar onRun={runCommand} target={selected?.title} />
      </main>

      {selected && (
        <aside className="inspector" style={{ '--c': selected.color }}>
          <div className="insp-top">
            <span className="dot" />
            <span className="kind">{selected.parent_id ? 'Subtask' : 'Centre of the map'}</span>
            <button className="icon-btn" title="Close" onClick={() => setSel(null)}><Icon name="x" size={16} /></button>
          </div>
          <input className="title-in" value={selected.title} onChange={(e) => patchNode(selected.id, { title: e.target.value }, { debounce: true })} />
          <button className={`done-btn ${selected.done ? 'on' : ''}`} onClick={() => toggle(selected.id)}>
            <span className="box">{selected.done && <Icon name="check" size={14} />}</span>
            {selected.done ? 'Done. Tap to reopen' : 'Mark as done'}
          </button>
          <div className="field-label">Assigned to</div>
          <input list="people" className="plain-in" placeholder="Who does this?" value={selected.assignee || ''} onChange={(e) => patchNode(selected.id, { assignee: e.target.value }, { debounce: true })} />
          <datalist id="people">{[...new Set(nodes.map((n) => n.assignee).filter(Boolean))].map((p) => <option key={p} value={p} />)}</datalist>
          <div className="row2">
            <div className="grow"><div className="field-label">Due</div><input type="date" className="plain-in" value={selected.due || ''} onChange={(e) => patchNode(selected.id, { due: e.target.value || null })} /></div>
            <div className="grow"><div className="field-label">Priority</div>
              <div className="pri-pick">{['low', 'med', 'high'].map((p) => <button key={p} className={`${p} ${selected.priority === p ? 'on' : ''}`} onClick={() => patchNode(selected.id, { priority: selected.priority === p ? '' : p })}>{p}</button>)}</div>
            </div>
          </div>
          <div className="field-label">Colour</div>
          <div className="swatches">
            {PALETTE.map((c) => (
              <button key={c} style={{ background: c }} className={selected.color === c ? 'on' : ''} onClick={() => patchNode(selected.id, { color: c })} />
            ))}
          </div>
          <div className="field-label">Notes</div>
          <textarea placeholder="Write anything about this idea…" value={selected.notes} onChange={(e) => patchNode(selected.id, { notes: e.target.value }, { debounce: true })} />
          <button className="primary" onClick={() => addChild(selected.id)}><Icon name="plus" size={16} /> Add subtask</button>
          <div className="row2">
            <button className="soft" onClick={() => patchNode(selected.id, { x: null, y: null })} title="Back to auto layout"><Icon name="reset" size={15} /> Reset spot</button>
            {selected.parent_id && (
              <button className="soft danger" onClick={() => {
                const n = descendants(nodes, selected.id).length
                const go = () => removeNode(selected.id)
                n ? setAsk({ title: `Delete “${selected.title}”?`, body: `This also removes its ${n} subtask${n > 1 ? 's' : ''}.`, label: 'Delete', onYes: go }) : go()
              }}><Icon name="trash" size={15} /> Delete</button>
            )}
          </div>
        </aside>
      )}

      {ask && (
        <div className="modal" onClick={() => setAsk(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="dialog-icon"><Icon name="trash" size={24} /></div>
            <h3>{ask.title}</h3>
            <p>{ask.body}</p>
            <div className="dialog-actions">
              <button className="cancel" autoFocus onClick={() => setAsk(null)}>Keep it</button>
              <button className="confirm-del" onClick={() => { const f = ask.onYes; setAsk(null); f() }}>{ask.label}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function CommandBar({ onRun, target }) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const submit = () => { onRun(text); setText('') }
  const copy = () => navigator.clipboard.writeText(AI_PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  return (
    <div className="cmd">
      <textarea
        rows={text.includes('\n') ? 4 : 1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder={`Type or paste text to grow “${target || 'the map'}”  —  Launch: Design, Build, Ship   ·   done Build   ·   Shift+Enter for an outline`}
      />
      <button className="copy" type="button" onClick={copy} title="Copy a prompt to give any AI; paste its answer here">{copied ? 'Copied ✓' : 'AI prompt'}</button>
      <button onClick={submit} disabled={!text.trim()}>Grow</button>
    </div>
  )
}

function ClaudeChat({ msgs, thinking, onSend, onClose }) {
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, thinking])
  const send = (e) => { e.preventDefault(); if (!text.trim() || thinking) return; onSend(text.trim()); setText('') }
  return (
    <div className="chatpanel">
      <div className="chat-head"><b>✦ Claude</b><button onClick={onClose}><Icon name="x" size={16} /></button></div>
      <div className="chat-body">
        {!msgs.length && <p className="muted">Tell me what to build or change. “Plan a trip to Japan”, “add a budget branch”, “mark design as done”…</p>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
        {thinking && <div className="bubble assistant">Thinking…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Claude…" /><button disabled={thinking || !text.trim()}>Send</button></form>
    </div>
  )
}
