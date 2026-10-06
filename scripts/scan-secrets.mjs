/**
 * Fails a commit that would put a credential into history. Deliberately narrow:
 * it looks for known credential shapes and for assignments to secret-ish names
 * with a value long enough to be a real key, so it does not fire on prose.
 */
const PATTERNS = [
  ["aws access key id", /AKIA[0-9A-Z]{16}/],
  ["aws secret access key", /aws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/i],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["github token", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["github fine grained token", /github_pat_[A-Za-z0-9_]{50,}/],
  ["openai style key", /sk-[A-Za-z0-9]{32,}/],
  ["slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  [
    "assigned secret",
    /\b(?:api[_-]?key|secret|passwd|password|auth[_-]?token|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']/i,
  ],
];

const input = await new Promise((resolve) => {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
  });
  process.stdin.on("end", () => resolve(buffer));
});

const findings = [];

for (const [label, pattern] of PATTERNS) {
  if (pattern.test(input)) findings.push(label);
}

if (findings.length > 0) {
  console.error(`Possible secret detected: ${findings.join(", ")}`);
  console.error("Refusing to commit. If this is a false positive, use --no-verify.");
  process.exit(1);
}

process.exit(0);
