// Airbnb iCal CORS proxy
// 클라이언트에서 직접 fetch가 막혀서 (CORS), 이 edge function이 우회.
// Authentication: Supabase JWT 자동 검증 (verify_jwt = true 기본).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function isAllowedHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const allowed = [
      'www.airbnb.com',
      'www.airbnb.co.kr',
      'admin.booking.com',
      'ical.booking.com',
    ];
    return allowed.includes(u.host);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = (body as { url?: string }).url;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isAllowedHost(url)) {
      return new Response(JSON.stringify({ error: 'host not allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const r = await fetch(url, {
      headers: { 'User-Agent': 'airbnb-ledger/1.0' },
    });
    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: `upstream ${r.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
    const text = await r.text();
    return new Response(JSON.stringify({ ics: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
