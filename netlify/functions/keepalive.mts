// Runs daily (see netlify.toml). One tiny read keeps the Supabase free tier active.
export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new Response("missing env", { status: 500 });
  const res = await fetch(`${url}/rest/v1/settings?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return new Response(`supabase ${res.status}`, { status: res.ok ? 200 : 502 });
};
