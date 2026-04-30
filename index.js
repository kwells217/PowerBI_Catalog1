const { app } = require('@azure/functions');

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function getToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://analysis.windows.net/powerbi/api/.default'
      })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function pbiGet(token, path) {
  const res = await fetch(`https://api.powerbi.com/v1.0/myorg${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Power BI API error ${res.status}: ${path}`);
  return res.json();
}

app.http('pbi-proxy', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'function',
  handler: async (request, context) => {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: CORS_HEADERS };
    }

    const action = new URL(request.url).searchParams.get('action');

    try {
      const token = await getToken();

      if (action === 'workspaces') {
        const data = await pbiGet(token, '/groups?$top=1000');
        return {
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(data)
        };
      }

      if (action === 'reports') {
        const wsId = new URL(request.url).searchParams.get('wsId');
        const data = await pbiGet(token, `/groups/${wsId}/reports`);
        return {
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(data)
        };
      }

      if (action === 'datasets') {
        const wsId = new URL(request.url).searchParams.get('wsId');
        const data = await pbiGet(token, `/groups/${wsId}/datasets`);
        return {
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(data)
        };
      }

      if (action === 'datasources') {
        const wsId = new URL(request.url).searchParams.get('wsId');
        const dsId = new URL(request.url).searchParams.get('dsId');
        const data = await pbiGet(token, `/groups/${wsId}/datasets/${dsId}/datasources`);
        return {
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(data)
        };
      }

      return {
        status: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unknown action. Use: workspaces, reports, datasets, datasources' })
      };

    } catch (e) {
      context.error('Proxy error:', e.message);
      return {
        status: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: e.message })
      };
    }
  }
});
