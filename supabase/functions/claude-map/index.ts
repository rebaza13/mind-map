// Mindbloom assistant. The browser sends the chat message, any attached files/images, plus the current map;
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
  `You are the assistant inside Mindbloom, a mind-map / to-do app. You are a sharp planner and thinker: you turn goals, documents, screenshots, photos, notes and messy ideas into clear, well-organised maps, and you answer questions about the map or the attached files.

How to work:
- Read every attached file or image carefully. If the user attaches something without saying what to do, summarise it into a useful branch (key points, tasks, deadlines, people, numbers).
- Plan properly: break big goals into 3-7 branches, each with concrete, actionable subtasks (go 2-4 levels deep when it helps). Put details, steps, links, amounts and dates in "notes", keep titles short (2-6 words).
- Only change existing nodes when asked. Never delete the root node (parent=none). Use the real ids from the map below.
- If the user only asks a question, answer it in "reply" and return no ops.
- "reply" is plain text (no markdown symbols), friendly and concise; say what you built or changed. Answer in the user's language.

Ops: {op:"add", id:<parent node id or a ref from an earlier add>, ref:<optional temp name so later adds can nest under it>, title, notes?}, {op:"rename", id, title}, {op:"done", id, done}, {op:"notes", id, notes}, {op:"delete", id}.

Current map "${name}" (id | parent | status title | notes):
${outline}`

// Attachments arrive as {name, type, data} (base64) for images and PDFs, or {name, type, text} for text files.
type Attachment = { name: string; type: string; data?: string; text?: string }
const fileText = (f: Attachment) => `Attached file "${f.name}":
${f.text}`

async function gemini(key: string, system: string, history: any[], message: string, files: Attachment[]) {
  const parts = [
    ...files.map((f) => f.text != null ? { text: fileText(f) } : { inline_data: { mime_type: f.type, data: f.data } }),
    { text: message },
  ]
  const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts },
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
  })
  // The main model is sometimes overloaded on the free tier, so fall back to the lite one.
  let res!: Response
  outer: for (const model of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body,
      })
      if (res.ok) break outer
      if (res.status !== 503 && res.status !== 429) break
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  if (res.status === 503 || res.status === 429) throw new Error('The free AI is busy right now. Please try again in a minute.')
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = await res.json()
  const outParts = out.candidates?.[0]?.content?.parts ?? []
  return JSON.parse(outParts.filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('') || '{}')
}

async function claude(key: string, system: string, history: any[], message: string, files: Attachment[]) {
  const content = [
    ...files.map((f) => f.text != null ? { type: 'text', text: fileText(f) }
      : { type: f.type === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: f.type, data: f.data } }),
    { type: 'text', text: message },
  ]
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
      model: 'claude-sonnet-5-5', max_tokens: 8000, system, tools: [tool], tool_choice: { type: 'tool', name: 'edit_map' },
      messages: [...history.slice(-20), { role: 'user', content }],
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

  const { message = '', history = [], nodes = [], mapName = '', files = [] } = await req.json()
  const outline = nodes.map((n: any) =>
    `${n.id} | parent=${n.parent_id ?? 'none'} | ${n.done ? '[x]' : '[ ]'} ${n.title}${n.notes ? ` | ${String(n.notes).slice(0, 200).replace(/\n/g, ' ')}` : ''}`).join('\n')
  const text = message || 'Look at the attached file(s) and add what matters to my map.'
  const system = SYSTEM(mapName, outline)

  try {
    const out = geminiKey ? await gemini(geminiKey, system, history, text, files) : await claude(claudeKey!, system, history, text, files)
    return json({ reply: out.reply ?? 'Done.', ops: out.ops ?? [] })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502)
  }
})
