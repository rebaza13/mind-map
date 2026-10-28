// Mindbloom assistant. The browser sends the chat message plus the current map;
// the model answers with edit operations that the browser applies and saves.
// Uses Google Gemini (free tier) when GEMINI_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER = 'rebazawat10@gmail.com'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const OPS = ['add', 'rename', 'done', 'notes', 'delete']
const SYSTEM = (name: string, outline: string) =>
  `You are the assistant inside Mindbloom, a mind-map / to-do app. The user talks to you in plain text and you build and edit their map for them. Respond with a short friendly "reply" and a list of "ops". Keep node titles short (2-6 words). Prefer organised branches with subtasks. Only touch existing nodes when asked. Never delete the root node (the one with parent=none).\n\nOps: {op:"add", id:<parent node id or a ref from an earlier add>, ref:<optional temp name for nesting>, title, notes?}, {op:"rename", id, title}, {op:"done", id, done}, {op:"notes", id, notes}, {op:"delete", id}.\n\nCurrent map "${name}":\n${outline}`

async function gemini(key: string, system: string, history: any[], message: string) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: message }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            reply: { type: 'STRING' },
            ops: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  op: { type: 'STRING', enum: OPS },
                  id: { type: 'STRING' },
                  ref: { type: 'STRING' },
                  title: { type: 'STRING' },
                  notes: { type: 'STRING' },
                  done: { type: 'BOOLEAN' },
                },
                required: ['op'],
              },
            },
          },
          required: ['reply', 'ops'],
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = await res.json()
  return JSON.parse(out.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')
}

async function claude(key: string, system: string, history: any[], message: string) {
  const tool = {
    name: 'edit_map',
    description: 'Reply to the user and apply edits to their mind map.',
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: OPS }, id: { type: 'string' }, ref: { type: 'string' },
              title: { type: 'string' }, notes: { type: 'string' }, done: { type: 'boolean' },
            },
            required: ['op'],
          },
        },
      },
      required: ['reply', 'ops'],
    },
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5', max_tokens: 2000, system, tools: [tool], tool_choice: { type: 'tool', name: 'edit_map' },
      messages: [...history.slice(-10), { role: 'user', content: message }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = await res.json()
  return out.content?.find((c: any) => c.type === 'tool_use')?.input ?? {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data } = await sb.auth.getUser()
  if (!data.user) return json({ error: 'Please sign in.' }, 401)

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')
  // Gemini's free tier is open to every signed-in user; the paid Claude key stays owner-only.
  if (!geminiKey && !(claudeKey && data.user.email === OWNER)) {
    return json({ error: 'No AI key is set on the server yet (GEMINI_API_KEY).' }, 500)
  }

  const { message, history = [], nodes = [], mapName = '' } = await req.json()
  const outline = nodes.map((n: any) => `${n.id} | parent=${n.parent_id ?? 'none'} | ${n.done ? '[x]' : '[ ]'} ${n.title}`).join('\n')
  const system = SYSTEM(mapName, outline)

  try {
    const out = geminiKey ? await gemini(geminiKey, system, history, message) : await claude(claudeKey!, system, history, message)
    return json({ reply: out.reply ?? 'Done.', ops: out.ops ?? [] })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502)
  }
})
