import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestBody = { conversationId?: string; callId?: string; kind?: 'voice' | 'video' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Missing authorization.' }, 401)
    const body = await request.json() as RequestBody
    if (!body.conversationId || !body.kind) return json({ error: 'conversationId and kind are required.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const dailyApiKey = Deno.env.get('DAILY_API_KEY')
    const dailyDomain = Deno.env.get('DAILY_DOMAIN')
    if (!dailyApiKey || !dailyDomain) return json({ error: 'Daily is not configured on the server.' }, 503)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authorization } } })
    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Invalid session.' }, 401)
    const { data: member, error: memberError } = await userClient.from('conversation_members').select('conversation_id').eq('conversation_id', body.conversationId).eq('user_id', authData.user.id).maybeSingle()
    if (memberError || !member) return json({ error: 'You are not a member of this study space.' }, 403)

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let call: Record<string, unknown> | null = null
    if (body.callId) {
      const { data } = await adminClient.from('calls').select('*').eq('id', body.callId).eq('conversation_id', body.conversationId).maybeSingle()
      call = data
    }

    let roomName = typeof call?.room_name === 'string' ? call.room_name : ''
    let roomUrl = typeof call?.room_url === 'string' ? call.room_url : ''
    if (!roomName || !roomUrl) {
      roomName = `studymatch-${body.conversationId}-${crypto.randomUUID().slice(0, 8)}`
      const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${dailyApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
          properties: { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, enable_prejoin_ui: false, enable_screenshare: true },
        }),
      })
      if (!roomResponse.ok) return json({ error: 'Daily could not create the room.' }, 502)
      const room = await roomResponse.json() as { url: string }
      roomUrl = room.url || `https://${dailyDomain}/${roomName}`
      if (body.callId) await adminClient.from('calls').update({ room_name: roomName, room_url: roomUrl, status: 'active', started_at: new Date().toISOString() }).eq('id', body.callId)
    }

    const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dailyApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { room_name: roomName, user_id: authData.user.id, user_name: authData.user.user_metadata?.full_name ?? authData.user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 } }),
    })
    if (!tokenResponse.ok) return json({ error: 'Daily could not create a meeting token.' }, 502)
    const token = await tokenResponse.json() as { token: string }
    return json({ roomUrl, roomName, token: token.token })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected call setup error.' }, 500)
  }
})
