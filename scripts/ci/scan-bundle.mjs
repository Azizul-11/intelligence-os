// Fails when a browser bundle carries a private key, and (with --expect) when a public value that should be inlined is missing.
// Usage: node scripts/ci/scan-bundle.mjs <dist-dir> [--expect <public value>]...
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const expected = [];
let dir = "apps/web/dist";

for (let index = 0; index < args.length; index++) {
  if (args[index] === "--expect") {
    expected.push(args[++index] ?? "");
  } else {
    dir = args[index];
  }
}

if (!fs.existsSync(dir)) {
  console.error(`scan-bundle: ${dir} does not exist (build the web app first)`);
  process.exit(2);
}

// Exact secret formats, not semantic matching.
const PATTERNS = [
  { id: "supabase-secret-key", re: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { id: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "groq-key", re: /gsk_[A-Za-z0-9]{20,}/g },
  { id: "openai-style-key", re: /sk-[A-Za-z0-9_-]{32,}/g },
  { id: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { id: "github-token", re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { id: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { id: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const TEXT_FILE = /\.(js|mjs|css|html|json|map|txt|svg)$/;

const hits = [];
const found = new Set();
let files = 0;

function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!TEXT_FILE.test(entry.name)) {
      continue;
    }

    files++;
    const text = fs.readFileSync(full, "utf8");

    for (const value of expected) {
      if (value !== "" && text.includes(value)) {
        found.add(value);
      }
    }

    for (const { id, re } of PATTERNS) {
      for (const match of text.matchAll(re)) {
        hits.push(`${id}  ${full}  ${match[0].slice(0, 8)}...`);
      }
    }

    for (const match of text.matchAll(JWT)) {
      let role = "?";

      try {
        role = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString("utf8")).role ?? "(none)";
      } catch {
        role = "?";
      }

      // The anon role is public by design; any other role in a browser bundle is a leak.
      if (role !== "anon") {
        hits.push(`jwt-role-${role}  ${full}  ${match[0].slice(0, 8)}...`);
      }
    }
  }
}

walk(dir);

const missing = expected.filter((value) => !found.has(value));

console.log(`scanned ${files} files under ${dir}`);

for (const value of expected) {
  console.log(`${found.has(value) ? "inlined " : "MISSING "} expected public value ${value.slice(0, 14)}...`);
}

for (const hit of hits) {
  console.log(`LEAK  ${hit}`);
}

if (hits.length === 0 && missing.length === 0) {
  console.log(`bundle clean: 0 private keys, ${expected.length} expected public value(s) inlined`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error("scan-bundle: a public value was not inlined, so the scan would prove nothing (and the app would ship without it)");
}

process.exit(1);
