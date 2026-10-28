import { useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import { APP_URL } from './supabase'

// Sidebar workspace picker.
export function WsSwitch({ workspaces, wsId, onPick, onCreate }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(null)
  const cur = workspaces.find((w) => w.id === wsId)
  const create = (e) => {
    e.preventDefault()
    if (name.trim()) onCreate(name.trim())
    setName(null)
    setOpen(false)
  }
  return (
    <div className="ws">
      <button className="ws-btn" onClick={() => setOpen(!open)}>
        <span className="ws-tile">{(cur?.name || '?')[0].toUpperCase()}</span>
        <span className="ws-name"><small>Workspace</small>{cur?.name || '…'}</span>
        <Icon name="chev" size={16} />
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="ws-menu">
            {workspaces.map((w) => (
              <button key={w.id} className={w.id === wsId ? 'on' : ''} onClick={() => { onPick(w.id); setOpen(false) }}>
                <span className="ws-tile sm">{w.name[0].toUpperCase()}</span>{w.name}
                {w.id === wsId && <Icon name="check" size={15} />}
              </button>
            ))}
            {name === null ? (
              <button className="ws-new" onClick={() => setName('')}><Icon name="plus" size={15} /> New workspace</button>
            ) : (
              <form onSubmit={create}><input autoFocus placeholder="Workspace name" value={name} onChange={(e) => setName(e.target.value)} /></form>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Members, pending invites and the invite form.
export default function Team({ ws, members, invites, me, online, isOwner, onInvite, onRevoke, onRemove, onLeave, onDelete, onClose }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const onlineIds = new Set(online.map((u) => u.id))
  const send = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    await onInvite(email)
    setBusy(false)
    setEmail('')
  }
  const copy = () => navigator.clipboard.writeText(APP_URL)

  return (
    <div className="modal" onClick={onClose}>
      <div className="team" onClick={(e) => e.stopPropagation()} role="dialog">
        <header>
          <div>
            <h3>{ws?.name}</h3>
            <p>{members.length} {members.length === 1 ? 'person' : 'people'} share this workspace</p>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>

        <form className="invite-form" onSubmit={send}>
          <Icon name="mail" size={18} />
          <input type="email" required placeholder="friend@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
        </form>
        <p className="hint">They get an email with a sign-in link. Signing in with Google using that same address also works, and they land in this workspace.</p>

        <div className="people">
          {members.map((m) => (
            <div key={m.user_id} className="person">
              <Avatar name={m.name || m.email} url={m.avatar_url} size={38} online={onlineIds.has(m.user_id)} />
              <div className="who">
                <b>{m.name || m.email}{m.user_id === me && <em> (you)</em>}</b>
                <small>{m.email}</small>
              </div>
              <span className={`role ${m.role}`}>{m.role}</span>
              {isOwner && m.user_id !== me && <button className="icon-btn" title="Remove" onClick={() => onRemove(m)}><Icon name="x" size={15} /></button>}
            </div>
          ))}
          {invites.map((i) => (
            <div key={i.id} className="person pending">
              <span className="avatar-wrap" style={{ width: 38, height: 38 }}><span className="avatar" style={{ width: 38, height: 38 }}><Icon name="mail" size={16} /></span></span>
              <div className="who"><b>{i.email}</b><small>Invite pending</small></div>
              <span className="role">invited</span>
              <button className="icon-btn" title="Cancel invite" onClick={() => onRevoke(i.id)}><Icon name="x" size={15} /></button>
            </div>
          ))}
        </div>

        <footer>
          <button className="soft" onClick={copy}><Icon name="link" size={15} /> Copy app link</button>
          {isOwner ? (
            <button className="soft danger" onClick={onDelete}><Icon name="trash" size={15} /> Delete workspace</button>
          ) : (
            <button className="soft danger" onClick={onLeave}><Icon name="logout" size={15} /> Leave workspace</button>
          )}
        </footer>
      </div>
    </div>
  )
}
