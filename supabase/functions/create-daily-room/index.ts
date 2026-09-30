import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestBody = { conversationId?: string; callId?: string; kind?: 'voice' | 'video' }
type CallRecord = { id: string; conversation_id: string; caller_id: string; recipient_ids: string[]; kind: 'voice' | 'video'; status: string; room_name?: string | null; room_url?: string | null }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Missing authorization.' }, 401)

    const body = await request.json() as RequestBody
    if (!body.conversationId || !body.callId || !body.kind) return json({ error: 'conversationId, callId, and kind are required.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const dailyApiKey = Deno.env.get('DAILY_API_KEY')
    const dailyDomain = Deno.env.get('DAILY_DOMAIN')?.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: 'Supabase call services are not configured on the server.' }, 503)
    if (!dailyApiKey || !dailyDomain) return json({ error: 'Daily is not configured on the server.' }, 503)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authorization } } })
    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Invalid session.' }, 401)

    const { data: member, error: memberError } = await userClient.from('conversation_members').select('conversation_id').eq('conversation_id', body.conversationId).eq('user_id', authData.user.id).maybeSingle()
    if (memberError || !member) return json({ error: 'You are not a member of this study space.' }, 403)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: call, error: callError } = await adminClient.from('calls').select('*').eq('id', body.callId).eq('conversation_id', body.conversationId).maybeSingle() as { data: CallRecord | null; error: { message: string } | null }
    if (callError) return json({ error: 'The call invite could not be loaded.' }, 500)
    if (!call) return json({ error: 'The call invite no longer exists.' }, 404)
    if (call.status === 'ended' || call.status === 'declined') return json({ error: 'This call has already ended.' }, 409)

    const participantIds = [call.caller_id, ...(Array.isArray(call.recipient_ids) ? call.recipient_ids : [])].map(String)
    if (!participantIds.includes(authData.user.id)) return json({ error: 'You are not invited to this call.' }, 403)
    if (call.kind !== body.kind) return json({ error: 'The call type does not match the invite.' }, 400)

    let roomName = typeof call.room_name === 'string' ? call.room_name : ''
    let roomUrl = typeof call.room_url === 'string' ? call.room_url : ''
    if (!roomName || !roomUrl) {
      // A deterministic name makes concurrent token requests resolve to one Daily room.
      roomName = `studymatch-${body.callId}`
      const roomPayload = {
        name: roomName,
        privacy: 'private',
        properties: { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, enable_prejoin_ui: false, enable_screenshare: true },
      }
      const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${dailyApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(roomPayload),
      })

      let room: { url?: string } = {}
      if (roomResponse.ok) {
        room = await roomResponse.json() as { url?: string }
      } else if (roomResponse.status === 409) {
        const existingResponse = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, { headers: { Authorization: `Bearer ${dailyApiKey}` } })
        if (!existingResponse.ok) return json({ error: 'Daily could not load the existing call room.' }, 502)
        room = await existingResponse.json() as { url?: string }
      } else {
        return json({ error: 'Daily could not create the call room.' }, 502)
      }

      roomUrl = room.url || `https://${dailyDomain}/${roomName}`
      const { error: roomUpdateError } = await adminClient.from('calls').update({ room_name: roomName, room_url: roomUrl, status: 'active', started_at: new Date().toISOString() }).eq('id', body.callId)
      if (roomUpdateError) return json({ error: 'The call room could not be saved.' }, 500)
    }

    const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dailyApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { room_name: roomName, user_id: authData.user.id, user_name: authData.user.user_metadata?.full_name ?? authData.user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 } }),
    })
    if (!tokenResponse.ok) return json({ error: 'Daily could not create a meeting token.' }, 502)
    const token = await tokenResponse.json() as { token?: string }
    if (!token.token) return json({ error: 'Daily returned an empty meeting token.' }, 502)

    const { error: participantError } = await adminClient.from('call_participants').upsert({ call_id: body.callId, user_id: authData.user.id, joined_at: new Date().toISOString(), left_at: null })
    if (participantError) return json({ error: 'The call participant could not be recorded.' }, 500)

    return json({ roomUrl, roomName, token: token.token })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected call setup error.' }, 500)
  }
})
