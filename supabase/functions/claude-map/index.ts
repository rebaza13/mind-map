// Mindbloom ↔ Claude. The browser sends the chat message plus the current map;
// Claude answers with edit operations that the browser applies and saves.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER = 'rebazawat10@gmail.com'
const MODEL = 'claude-sonnet-5-5'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const tool = {
  name: 'edit_map',
  description: 'Reply to the user and apply edits to their mind map.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Short friendly reply to the user.' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['add', 'rename', 'done', 'notes', 'delete'] },
            id: { type: 'string', description: 'Existing node id (rename/done/notes/delete), or the parent id for add. Use a ref from an earlier add op as the parent when nesting new nodes.' },
            ref: { type: 'string', description: 'For add: a short temp name so later ops can use it as parent id.' },
            title: { type: 'string' },
            notes: { type: 'string' },
            done: { type: 'boolean' },
          },
          required: ['op'],
        },
      },
    },
    required: ['reply', 'ops'],
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data } = await sb.auth.getUser()
  if (data.user?.email !== OWNER) return json({ error: 'Not allowed' }, 403)

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set on the server yet.' }, 500)

  const { message, history = [], nodes = [], mapName = '' } = await req.json()
  const outline = nodes.map((n: any) => `${n.id} | parent=${n.parent_id ?? 'none'} | ${n.done ? '[x]' : '[ ]'} ${n.title}`).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: `You are the assistant inside Mindbloom, a mind-map / to-do app. The user talks to you in plain text and you build and edit their map for them. Always answer by calling edit_map. Keep node titles short (2-6 words). Prefer organised branches with subtasks. Only touch existing nodes when asked. Never delete the root node (the one with parent=none).\n\nCurrent map "${mapName}":\n${outline}`,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'edit_map' },
      messages: [...history.slice(-10), { role: 'user', content: message }],
    }),
  })
  if (!res.ok) return json({ error: `Claude API ${res.status}: ${(await res.text()).slice(0, 300)}` }, 502)
  const out = await res.json()
  const call = out.content?.find((c: any) => c.type === 'tool_use')
  return json(call?.input ?? { reply: 'I could not make a change.', ops: [] })
})
