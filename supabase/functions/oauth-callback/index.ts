// Google OAuth code → token 교환 + user_google_tokens에 저장
//
// Request: POST { code: string, redirect_uri: string }
// Auth: Supabase JWT 자동 검증

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const defaultRedirect = Deno.env.get('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret) {
      return json({ error: 'GOOGLE_CLIENT_ID/SECRET not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return json({ error: 'auth failed' }, 401);
    }
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const action: 'authorize' | 'exchange' =
      body.action ?? (body.code ? 'exchange' : 'authorize');
    const redirectUri = body.redirect_uri || defaultRedirect;

    if (!redirectUri) {
      return json(
        { error: 'redirect_uri 필요 (client에서 전달하거나 GOOGLE_REDIRECT_URI 설정)' },
        400,
      );
    }

    // authorize: Google OAuth URL 반환 (client_id 노출 회피)
    if (action === 'authorize') {
      const url =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
          state: 'gmail-oauth',
          include_granted_scopes: 'true',
        }).toString();
      return json({ url });
    }

    const { code } = body;
    if (!code) return json({ error: 'code required' }, 400);

    // Exchange code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return json({ error: `google: ${text}` }, 400);
    }
    const tokens = await tokenRes.json();

    // Get email from userinfo
    let email: string | null = null;
    try {
      const ui = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (ui.ok) {
        const uj = await ui.json();
        email = uj.email ?? null;
      }
    } catch {
      /* non-fatal */
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: upErr } = await supabase
      .from('user_google_tokens')
      .upsert(
        {
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          expires_at: expiresAt,
          scopes: tokens.scope ?? null,
          email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (upErr) {
      return json({ error: upErr.message }, 500);
    }

    return json({ ok: true, email });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'unknown' },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
