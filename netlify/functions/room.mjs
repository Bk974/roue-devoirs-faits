import { getStore } from "@netlify/blobs";
import { handle } from "../lib/room-core.mjs";

export default async (req) => handle(req, getStore({ name: "rooms", consistency: "strong" }));
export const config = { path: "/api/room" };
