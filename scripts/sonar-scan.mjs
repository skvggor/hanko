import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * The image is pinned rather than floated on `community`. A quality gate that changes
 * under you is not a gate: a new rule released upstream would fail a deploy over code
 * nobody touched, which is how a gate teaches people to ignore it.
 */
const IMAGE = "sonarqube:26.9.0.129388-community";
const CONTAINER = "hanko-sonar";
const PORT = Number(process.env.SONAR_PORT ?? 9000);
const HOST_URL = `http://localhost:${PORT}`;
const BOOT_TIMEOUT_MS = 300_000;
const ADMIN = "admin:admin";

/**
 * The whole point of the arrangement is that the instance does not outlive the run, which
 * means there is normally no dashboard to open. Setting SONAR_KEEP_ALIVE=1 leaves it up
 * for inspection, for the times when reading the gate in the browser beats reading it in
 * a terminal. The teardown then belongs to whoever asked for it to stay.
 */
const KEEP_ALIVE = process.env.SONAR_KEEP_ALIVE === "1";

/**
 * How many code smells the whole repository is allowed to carry. This is the line that
 * decides whether the gate blocks a change, so it is a single named number rather than
 * something buried in a condition list.
 */
const SMELL_BUDGET = 13;

/**
 * The built-in gate carries no condition on code smells at all, so a run goes green with
 * smells wide open. That is the part of the promise this arrangement exists to keep, so
 * the gate is built here instead.
 *
 * Every condition is on the whole repository, which for an instance that forgets its
 * database between runs is the same as saying every line is new.
 */
const GATE_NAME = "hanko";

/**
 * Every condition is over the whole repository rather than over new code, and that is not
 * a compromise. An instance destroyed after every run has no previous analysis and so no
 * new code period at all, which means the `new_` metrics resolve to nothing and a
 * condition built on one passes without ever being evaluated. Over the whole repository
 * they say the same thing with a value behind it.
 */
const GATE_CONDITIONS = [
  { metric: "bugs", op: "GT", error: "0" },
  { metric: "vulnerabilities", op: "GT", error: "0" },
  { metric: "coverage", op: "LT", error: "80" },
  { metric: "duplicated_lines_density", op: "GT", error: "3" },
  { metric: "code_smells", op: "GT", error: String(SMELL_BUDGET) },
];

const AUTHORIZATION = `Basic ${Buffer.from(ADMIN).toString("base64")}`;

async function post(path, body) {
  const response = await fetch(`${HOST_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: AUTHORIZATION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
}

async function call(path) {
  const response = await fetch(`${HOST_URL}${path}`, {
    headers: { Authorization: AUTHORIZATION },
  });

  return response.json();
}

/**
 * Creating a gate seeds it with the built-in default's conditions, and every one of them
 * is expressed over new code, so every one of them would sit here looking like a gate and
 * evaluating nothing. They are deleted and replaced with the whole-repository equivalents.
 *
 * The smell budget is a ratchet rather than a target. Zero is the goal, but the codebase
 * carries smells that are argued rather than accidental, so the budget sits where the
 * repository actually is and moving it is a deliberate edit that shows up in the diff
 * next to the reason.
 */
async function installGate() {
  await post("/api/qualitygates/create", { name: GATE_NAME });

  const seeded = await call(`/api/qualitygates/show?name=${GATE_NAME}`);

  // Deleting and creating are separate passes on purpose: a condition has to be gone
  // before the replacement for the same metric can be added. Within a pass every request
  // touches a different row, so they go together rather than one round trip at a time.
  await Promise.all(
    (seeded.conditions ?? []).map((condition) =>
      post("/api/qualitygates/delete_condition", { id: condition.id }),
    ),
  );

  await Promise.all(
    GATE_CONDITIONS.map((condition) =>
      post("/api/qualitygates/create_condition", { gateName: GATE_NAME, ...condition }),
    ),
  );

  await post("/api/qualitygates/set_as_default", { name: GATE_NAME });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", () => {
      resolve(output);
    });
  });
}

async function containerIsRunning() {
  const output = await capture("docker", [
    "ps",
    "--filter",
    `name=^${CONTAINER}$`,
    "--format",
    "{{.Names}}",
  ]);

  return output.trim().length > 0;
}

async function removeContainer() {
  try {
    await run("docker", ["rm", "-f", CONTAINER]);
  } catch {
    // The instance may never have come up, and its absence is the state we wanted.
  }
}

/**
 * The instance answers before it is ready to be analysed, and analysing early produces a
 * page of errors that look like findings and are not. Polling the status endpoint is the
 * only honest readiness signal the container offers.
 */
async function waitUntilReady() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!(await containerIsRunning())) {
      throw new Error("the container stopped before it finished starting");
    }

    try {
      const response = await fetch(`${HOST_URL}/api/system/status`);
      const body = await response.json();

      if (body.status === "UP") return;
    } catch {
      // Not listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`the instance was not ready within ${BOOT_TIMEOUT_MS / 1000}s`);
}

/**
 * The instance ships with the default administrator credentials and the analysis needs
 * one that is allowed to create the project, because the project does not exist yet on a
 * fresh database. Relaxing forced authentication would not help: an anonymous analysis
 * may only touch public projects, and an absent one is not public. A token is minted
 * here instead, and it is worth nothing by the time the script returns, which is why it
 * can be handed to the scanner on the command line without ceremony.
 */
async function generateToken() {
  const response = await fetch(`${HOST_URL}/api/user_tokens/generate`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(ADMIN).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      name: "hanko-scan",
      login: "admin",
      type: "GLOBAL_ANALYSIS_TOKEN",
    }),
  });

  if (!response.ok) {
    throw new Error(`could not mint an analysis token: ${response.status}`);
  }

  const body = await response.json();

  if (typeof body.token !== "string" || body.token.length === 0) {
    throw new Error("the instance accepted the request but returned no token");
  }

  return body.token;
}

async function ensureCoverage() {
  if (existsSync("coverage/lcov.info")) return;

  console.log("No coverage report found, generating one for the scanner to read.");
  await run("npx", ["vitest", "run", "--coverage"]);
}

/**
 * The verdict is the exit code, but an exit code alone cannot tell you what to do next.
 * The instance still holds the findings at this point, so they are read out before it is
 * destroyed: after this runs there is no server left to ask.
 */
async function report() {
  const projectKey = "hanko";

  console.log("\n--- what the analysis found ---");

  const measures = await call(
    `/api/measures/component?component=${projectKey}&metricKeys=duplicated_lines_density,duplicated_blocks,coverage,bugs,vulnerabilities,code_smells`,
  );

  for (const measure of measures.component?.measures ?? []) {
    console.log(`  ${measure.metric}: ${measure.value}`);
  }

  // The duplication detector is the one sensor that sees across files, so it is the
  // reason this whole arrangement exists. Naming the files is the difference between a
  // percentage nobody can act on and a file to go and look at. `ps` is the page size;
  // `p` is the page index, and asking for page 200 of forty files returns nothing.
  const tree = await call(
    `/api/measures/component_tree?component=${projectKey}&metricKeys=duplicated_lines_density,duplicated_lines&qualifiers=FIL&ps=500`,
  );

  const duplicated = (tree.components ?? []).filter((component) =>
    (component.measures ?? []).some((measure) => Number.parseFloat(measure.value) > 0),
  );

  console.log(`\nfiles carrying duplicated lines: ${duplicated.length}`);
  for (const component of duplicated) {
    const density = component.measures?.find((m) => m.metric === "duplicated_lines_density");
    const lines = component.measures?.find((m) => m.metric === "duplicated_lines");

    console.log(`  ${component.path}: ${density?.value ?? "?"}% (${lines?.value ?? "?"} lines)`);
  }

  const issues = await call(`/api/issues/search?componentKeys=${projectKey}&ps=500`);

  const bySeverity = new Map();
  for (const issue of issues.issues ?? []) {
    bySeverity.set(issue.severity, (bySeverity.get(issue.severity) ?? 0) + 1);
  }

  console.log(`\ntotal issues: ${issues.total ?? 0}`);
  for (const [severity, count] of bySeverity) {
    console.log(`  ${severity}: ${count}`);
  }

  for (const issue of issues.issues ?? []) {
    const path = issue.component.replace(`${projectKey}:`, "");

    console.log(
      `  [${issue.type}/${issue.severity}] ${path}:${issue.line ?? "?"} ${issue.message}`,
    );
  }

  console.log(
    "\nThe gate was SonarQube's built-in default, whose conditions are not readable\n" +
      "through the API. A gate that passes while issues are open means those issues are\n" +
      "not among the conditions it counts, not that they do not exist.",
  );
}

async function stop() {
  if (KEEP_ALIVE) {
    console.log(`\nLeft running for inspection at ${HOST_URL}, signing in as admin/admin.`);
    console.log(`The project is at ${HOST_URL}/dashboard?id=hanko`);
    console.log(`When you are done: docker rm -f ${CONTAINER}`);
    return;
  }

  console.log("\nRemoving the instance. What is left is the verdict and nothing else.");
  await removeContainer();
}

async function main() {
  await ensureCoverage();

  console.log(`Starting ${IMAGE} on ${HOST_URL}.`);
  await run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    CONTAINER,
    "--publish",
    `${PORT}:9000`,
    "--env",
    "SONAR_WEB_JAVAOPTS=-Xmx1G",
    "--env",
    "SONAR_ES_JAVAOPTS=-Xmx512m",
    IMAGE,
  ]);

  let failure = null;

  try {
    console.log("Waiting for the instance to be ready.");
    await waitUntilReady();

    const token = await generateToken();
    await installGate();
    console.log("Instance ready. Analysing.");

    await run("npx", [
      "sonar-scanner-npm",
      `-Dsonar.host.url=${HOST_URL}`,
      `-Dsonar.token=${token}`,
    ]);
  } catch (error) {
    failure = error;
  }

  // The scanner exits non-zero precisely when the gate reproved, which is the moment the
  // findings matter most, so the report runs whether the analysis passed or not.
  try {
    await report();
  } catch {
    // The instance never came up far enough to be asked.
  }

  await stop();

  if (failure !== null) throw failure;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
