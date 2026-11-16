// Runs the keeper every 20 seconds against a running Coc web app.
// Usage: node scripts/keeper-loop.mjs [http://localhost:3000]
// On Vercel the same sweep runs from vercel.json (daily on the Hobby plan), and every
// lease page also triggers it as soon as one of its deadlines passes.
const base = process.argv[2] || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

async function tick() {
  try {
    const res = await fetch(`${base}/api/keeper`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
    const json = await res.json();
    const done = (json.results || []).filter((r) => r.ok);
    if (done.length) console.log(new Date().toISOString(), "settled", done.map((r) => `#${r.id} ${r.tx}`).join(", "));
    else if (json.error) console.log(new Date().toISOString(), "error", json.error);
  } catch (e) {
    console.log(new Date().toISOString(), "unreachable", e.message);
  }
}

tick();
setInterval(tick, 20_000);
