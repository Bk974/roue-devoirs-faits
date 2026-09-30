import { getStore } from "@netlify/blobs";

// Tous les jours : efface les salles de plus de 24 heures.
export default async () => {
  const store = getStore({ name: "rooms", consistency: "strong" });
  const out = await store.list();
  let n = 0;
  for (const b of out.blobs || []) {
    const md = await store.getMetadata(b.key);
    const t = md && md.metadata && md.metadata.t;
    if (!t || Date.now() - t > 24 * 3600 * 1000) { await store.delete(b.key); n++; }
  }
  console.log("salles nettoyées :", n);
};
export const config = { schedule: "@daily" };
