const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'www-authenticate': 'Basic realm="VANTA GAMES"'
    }
  });
}

function isAdmin(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(':');
    if (i < 0) return false;
    return decoded.slice(0, i) === env.ADMIN_USERNAME && decoded.slice(i + 1) === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

function supabaseHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

async function supabaseFetch(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: supabaseHeaders(env, init.headers || {})
  });
}

async function uploadFile(env, file) {
  if (!file || typeof file === 'string') return '';

  const original = file.name || 'file';
  const safe = original.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const body = await file.arrayBuffer();

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/games/${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: supabaseHeaders(env, {
        'content-type': file.type || 'application/octet-stream',
        'x-upsert': 'false'
      }),
      body
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Storage upload failed (${response.status}): ${message}`);
  }

  return `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/games/${encodeURIComponent(key)}`;
}

async function listGames(env) {
  const response = await supabaseFetch(
    env,
    '/rest/v1/games?select=*,game_images(*)&order=created_at.desc'
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase read failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function publishGame(request, env) {
  if (!isAdmin(request, env)) return unauthorized();

  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return json({ error: 'نام بازی الزامی است' }, 400);

  const cover = await uploadFile(env, form.get('cover'));
  const logo = await uploadFile(env, form.get('logo'));
  const trailer = await uploadFile(env, form.get('trailer'));
  const gameFile = await uploadFile(env, form.get('gameFile'));

  const game = {
    name,
    genre: String(form.get('genre') || ''),
    version: String(form.get('version') || '1.0.0'),
    size: String(form.get('size') || ''),
    description: String(form.get('description') || ''),
    cover_url: cover,
    logo_url: logo,
    trailer_url: trailer,
    game_file_url: gameFile,
    game_file_name: form.get('gameFile') instanceof File ? form.get('gameFile').name : ''
  };

  const insert = await supabaseFetch(env, '/rest/v1/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'prefer': 'return=representation' },
    body: JSON.stringify(game)
  });

  if (!insert.ok) {
    const message = await insert.text();
    throw new Error(`Supabase insert failed (${insert.status}): ${message}`);
  }

  const rows = await insert.json();
  const created = rows[0];

  const images = form.getAll('screens');
  const imageRows = [];
  for (const file of images) {
    if (!(file instanceof File) || file.size === 0) continue;
    const url = await uploadFile(env, file);
    imageRows.push({ game_id: created.id, image_url: url });
  }

  if (imageRows.length) {
    const imageInsert = await supabaseFetch(env, '/rest/v1/game_images', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(imageRows)
    });
    if (!imageInsert.ok) {
      const message = await imageInsert.text();
      throw new Error(`Supabase image insert failed (${imageInsert.status}): ${message}`);
    }
  }

  return json({ ok: true, game: created });
}

async function deleteGame(request, env, id) {
  if (!isAdmin(request, env)) return unauthorized();

  const response = await supabaseFetch(env, `/rest/v1/games?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'prefer': 'return=minimal' }
  });

  if (!response.ok) {
    const message = await response.text();
    return json({ error: message }, 500);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, service: 'VANTA GAMES', platform: 'Cloudflare Workers' });
      }

      if (url.pathname === '/api/games' && request.method === 'GET') {
        return json(await listGames(env));
      }

      if (url.pathname === '/api/games' && request.method === 'POST') {
        return await publishGame(request, env);
      }

      const match = url.pathname.match(/^\/api\/games\/([^/]+)$/);
      if (match && request.method === 'DELETE') {
        return await deleteGame(request, env, match[1]);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error?.message || 'Internal Server Error' }, 500);
    }
  }
};
