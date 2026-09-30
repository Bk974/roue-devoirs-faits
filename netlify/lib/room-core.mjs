// Logique du relais « Écouter avant d'aider » : indépendante de Netlify pour pouvoir être testée.
// Le magasin (store) expose set(key, value, options), delete(key) et list({ prefix }) -> { blobs: [{ key }] }.
// Organisation des clés (aucune lecture de valeur n'est nécessaire pour interroger une salle) :
//   CODE/j/<idEquipe>~<nom encodé>          une équipe connectée
//   CODE/v/<tour>/<idEquipe>~<lettre>       le choix verrouillé d'une équipe pour un tour

const CODE = /^[A-Z2-9]{4}-[TABC]$/;
const TEAM_ID = /^[a-z0-9]{6,20}$/;
const MAX_TEAMS = 80;
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function keysOf(store, prefix) {
  const out = await store.list({ prefix });
  return (out.blobs || []).map(b => b.key);
}

export async function handle(req, store) {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const code = (url.searchParams.get("code") || "").toUpperCase();
    if (code === "PING") return json({ ok: true });
    if (!CODE.test(code)) return json({ error: "code" }, 400);
    const tour = Number(url.searchParams.get("tour") || 0);
    const joined = (await keysOf(store, code + "/j/")).map(k => {
      const rest = k.slice((code + "/j/").length), i = rest.indexOf("~");
      return { id: rest.slice(0, i), team: decodeURIComponent(rest.slice(i + 1)) };
    });
    const votes = { A: 0, B: 0, C: 0, D: 0 }, names = { A: [], B: [], C: [], D: [] };
    if (tour >= 1 && tour <= 60) {
      const byId = Object.fromEntries(joined.map(j => [j.id, j.team]));
      for (const k of await keysOf(store, `${code}/v/${tour}/`)) {
        const rest = k.slice(`${code}/v/${tour}/`.length), i = rest.indexOf("~");
        const id = rest.slice(0, i), pick = rest.slice(i + 1);
        if (!votes.hasOwnProperty(pick)) continue;
        votes[pick]++; names[pick].push(byId[id] || "Équipe");
      }
    }
    return json({ ok: true, joined: joined.length, teams: joined.map(j => j.team), votes, names });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch (e) { return json({ error: "json" }, 400); }
    const code = String(b.code || "").toUpperCase(), id = String(b.id || "");
    if (!CODE.test(code) || !TEAM_ID.test(id)) return json({ error: "champs" }, 400);
    if (b.type === "join") {
      const name = String(b.team || "Équipe").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 30) || "Équipe";
      const existing = await keysOf(store, code + "/j/");
      const mine = existing.filter(k => k.startsWith(`${code}/j/${id}~`));
      if (!mine.length && existing.length >= MAX_TEAMS) return json({ error: "complet" }, 429);
      for (const k of mine) await store.delete(k);
      await store.set(`${code}/j/${id}~${encodeURIComponent(name)}`, "1", { metadata: { t: Date.now() } });
      return json({ ok: true });
    }
    if (b.type === "vote") {
      const tour = Number(b.tour), pick = String(b.pick || "");
      if (!(tour >= 1 && tour <= 60) || !["A", "B", "C", "D"].includes(pick)) return json({ error: "champs" }, 400);
      const prefix = `${code}/v/${tour}/${id}~`;
      for (const k of await keysOf(store, prefix)) if (k !== prefix + pick) await store.delete(k);
      await store.set(prefix + pick, "1", { metadata: { t: Date.now() } });
      return json({ ok: true });
    }
    return json({ error: "type" }, 400);
  }
  return json({ error: "méthode" }, 405);
}
