// Run with: node test/relay.test.mjs   (no dependencies; mocks the GitHub API)
import worker from "../src/index.js";

let file = { text: "submitted_at,answer,name,email,business\n", sha: "sha-0" };
let putCalls = 0, forceConflicts = 0;
const b64 = s => Buffer.from(s, "utf8").toString("base64");
globalThis.fetch = async (url, opts = {}) => {
  if (!opts.method || opts.method === "GET") {
    return new Response(JSON.stringify({ content: b64(file.text), sha: file.sha }), { status: 200 });
  }
  putCalls++;
  const body = JSON.parse(opts.body);
  if (forceConflicts > 0) { forceConflicts--; file = { ...file, sha: file.sha + "x" }; return new Response("{}", { status: 409 }); }
  if (body.sha !== file.sha) return new Response("{}", { status: 409 });
  file = { text: Buffer.from(body.content, "base64").toString("utf8"), sha: "sha-" + putCalls };
  return new Response("{}", { status: 200 });
};

const ORIGIN = "https://example.com";
const ENV = { GITHUB_TOKEN: "test", REPO: "owner/repo", ALLOWED_ORIGINS: `${ORIGIN}, https://other.example.com` };
const post = payload => worker.fetch(new Request("https://relay.test/", {
  method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(payload),
}), ENV);

const results = [];
const check = (label, cond) => results.push(`${cond ? "PASS" : "FAIL"}  ${label}`);

let r = await post({ answer: "Sample answer", name: "Jane Citizen", email: "jane@example.com", business: "Acme Pty Ltd" });
check("valid entry returns 200 ok", r.status === 200 && (await r.json()).ok === true);
check("row appended to CSV", file.text.split("\n").filter(Boolean).length === 2 && file.text.includes('"Jane Citizen","jane@example.com","Acme Pty Ltd"'));

forceConflicts = 2;
r = await post({ answer: "another guess", name: "Bob", email: "bob@example.com", business: 'Bob "Best" Co' });
check("survives 2 write conflicts via retry", r.status === 200 && file.text.split("\n").filter(Boolean).length === 3);
check("quotes inside values are escaped", file.text.includes('"Bob ""Best"" Co"'));

r = await post({ answer: "x", name: "=HYPERLINK(\"http://evil\")", email: "e@example.com", business: "+cmd" });
check("spreadsheet formula prefix neutralised", file.text.includes(`"'=HYPERLINK(""http://evil"")"`) && file.text.includes(`"'+cmd"`));

const before = file.text;
r = await post({ answer: "x", name: "A", email: "not-an-email", business: "B" });
check("invalid email rejected (400)", r.status === 400);
r = await post({ answer: "", name: "A", email: "a@b.com", business: "B" });
check("missing field rejected (400)", r.status === 400);
r = await post({ answer: "x".repeat(201), name: "A", email: "a@b.com", business: "B" });
check("over-long field rejected (400)", r.status === 400);

r = await post({ answer: "x", name: "Bot", email: "bot@b.com", business: "B", website: "spam.com" });
check("honeypot bot gets 200 but nothing written", r.status === 200 && file.text === before);

r = await worker.fetch(new Request("https://relay.test/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), ENV);
check("CORS preflight allows a configured origin", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === ORIGIN);
r = await worker.fetch(new Request("https://relay.test/", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), ENV);
check("CORS does not echo an unlisted origin", r.headers.get("Access-Control-Allow-Origin") === ORIGIN);
r = await worker.fetch(new Request("https://relay.test/", { method: "GET" }), ENV);
check("GET rejected (405)", r.status === 405);

console.log(results.join("\n"));
process.exitCode = results.some(l => l.startsWith("FAIL")) ? 1 : 0;
