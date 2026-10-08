const FIELDS = ["answer", "name", "email", "business"];
const MAX_LEN = 200;

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, cors);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "bad_request" }, 400, cors);
    }

    // Honeypot: real visitors never fill this hidden field; bots usually do.
    if (typeof data.website === "string" && data.website.trim()) return json({ ok: true }, 200, cors);

    const entry = {};
    for (const field of FIELDS) {
      const value = typeof data[field] === "string" ? data[field].trim() : "";
      if (!value || value.length > MAX_LEN) return json({ ok: false, error: `invalid_${field}` }, 400, cors);
      entry[field] = value;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return json({ ok: false, error: "invalid_email" }, 400, cors);

    const row = [new Date().toISOString(), entry.answer, entry.name, entry.email, entry.business]
      .map(csvCell)
      .join(",") + "\n";

    try {
      await appendRow(env, row);
    } catch (err) {
      console.error("append failed:", err.message);
      return json({ ok: false, error: "storage_failed" }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// Quote every cell, and neutralise leading =,+,-,@ so the CSV can't run formulas when opened in Excel.
export function csvCell(value) {
  let s = String(value).replace(/[\r\n]+/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// Read-modify-write via the Contents API; the sha check makes concurrent submissions retry instead of overwriting each other.
export async function appendRow(env, row) {
  const base = `https://api.github.com/repos/${env.REPO}/contents/${env.CSV_PATH || "entries.csv"}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "xmas-conundrum-relay",
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const read = await fetch(`${base}?nocache=${Date.now()}`, { headers });
    if (!read.ok) throw new Error(`read ${read.status}`);
    const file = await read.json();
    const current = fromBase64(file.content);
    const updated = (current === "" || current.endsWith("\n") ? current : current + "\n") + row;

    const write = await fetch(base, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "New entry", content: toBase64(updated), sha: file.sha }),
    });
    if (write.ok) return;
    if (write.status !== 409 && write.status !== 422) throw new Error(`write ${write.status}`);
    await new Promise(r => setTimeout(r, 200 * (attempt + 1) + Math.random() * 300));
  }
  throw new Error("too many conflicting writes");
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function toBase64(str) {
  let bin = "";
  for (const byte of new TextEncoder().encode(str)) bin += String.fromCharCode(byte);
  return btoa(bin);
}
