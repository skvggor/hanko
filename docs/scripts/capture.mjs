#!/usr/bin/env node
/**
 * Renders every picture the documentation carries: the manual's step shots, the README
 * hero and the social card. It photographs the real application rather than a mock, so
 * it starts the dev server itself unless one is handed in with --url.
 *
 *   node docs/scripts/capture.mjs all
 *   node docs/scripts/capture.mjs manual --url http://localhost:5173
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const IMAGES_DIRECTORY = path.join(REPOSITORY_ROOT, "docs", "images");
const SOCIAL_TEMPLATE = path.join(REPOSITORY_ROOT, "docs", "scripts", "og-image.html");
const SOCIAL_OUTPUT = path.join(REPOSITORY_ROOT, "public", "og-image.png");
const FONT_PATH = path.join(
  REPOSITORY_ROOT,
  "node_modules",
  "@fontsource-variable",
  "space-grotesk",
  "files",
  "space-grotesk-latin-wght-normal.woff2",
);
const DEV_SERVER_PORT = 4173;
const READY_TIMEOUT_MILLISECONDS = 60_000;
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const HERO_VIEWPORT = { width: 1440, height: 900 };
const SOCIAL_VIEWPORT = { width: 1200, height: 630 };

function parseArguments(argv) {
  const target = argv[2] ?? "all";
  const urlIndex = argv.indexOf("--url");

  if (!["manual", "og", "all"].includes(target)) {
    throw new Error(`unknown capture target "${target}" (expected manual, og or all)`);
  }

  return {
    target,
    origin: urlIndex === -1 ? null : (argv[urlIndex + 1] ?? null),
  };
}

function spawnCommand(command, arguments_, options) {
  return spawn(command, arguments_, options);
}

function spawnCommandSync(command, arguments_) {
  return spawnSync(command, arguments_, { stdio: "inherit" });
}

/**
 * playwright-core ships without a browser of its own, so this walks from the most
 * specific answer to the most available one instead of failing on a machine that keeps
 * its Chromium somewhere else.
 */
async function launchBrowser() {
  const explicit = process.env.HANKO_BROWSER;
  const attempts = [
    ...(explicit ? [{ executablePath: explicit }] : []),
    {},
    { executablePath: "/usr/bin/chromium" },
  ];

  let lastProblem;
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (problem) {
      lastProblem = problem;
    }
  }
  throw lastProblem;
}

function startDevServer() {
  const child = spawnCommand(
    "npm",
    ["run", "dev", "--", "--port", String(DEV_SERVER_PORT), "--strictPort"],
    { cwd: REPOSITORY_ROOT, detached: true, stdio: "inherit" },
  );

  return {
    origin: `http://localhost:${DEV_SERVER_PORT}`,
    stop() {
      if (child.pid === undefined) return;
      try {
        // The group goes, not just npm, because vite leaves workerd behind.
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // The group is already gone, which is all stopping exists to ensure.
      }
    },
  };
}

async function isAnswering(origin) {
  try {
    return (await fetch(origin)).ok;
  } catch {
    // A refused connection is the expected answer while vite is still coming up.
    return false;
  }
}

async function waitForServer(origin) {
  const deadline = Date.now() + READY_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (await isAnswering(origin)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the dev server never answered on ${origin}`);
}

async function captureShot(page, name) {
  await page.evaluate(() => globalThis.document.fonts.ready);
  // The pointer stays where the last click left it, and a card still hovered under
  // the cursor photographs as a hover the reader never triggered.
  await page.mouse.move(0, 0);
  const target = path.join(IMAGES_DIRECTORY, `${name}.png`);
  await page.screenshot({ path: target, scale: "css" });
  console.log(`captured ${path.relative(REPOSITORY_ROOT, target)}`);
}

async function captureElementShot(page, element, name) {
  // Centring keeps the pinned header and footer from landing on top of the figure,
  // which is what a plain scroll into view leaves behind.
  await element.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.mouse.move(0, 0);
  const target = path.join(IMAGES_DIRECTORY, `${name}.png`);
  await element.screenshot({ path: target, scale: "css" });
  console.log(`captured ${path.relative(REPOSITORY_ROOT, target)}`);
}

async function enterRoom(page, name) {
  await page.getByRole("heading", { name: "What is your name?" }).waitFor();
  await page.locator("#gate-name").fill(name);
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page.getByText("Round 1", { exact: true }).waitFor();
}

async function vote(page, value) {
  await page.getByRole("button", { name: `Vote ${value}`, exact: true }).click();
  await page.getByRole("button", { name: `Selected vote ${value}`, exact: true }).waitFor();
}

/**
 * The dock opens itself on any screen wide enough to hold it, which would cover the
 * bottom right of every room shot. It is put back for the chat figure.
 */
async function minimizeChatIfOpen(page) {
  const minimize = page.getByRole("button", { name: "Minimize chat", exact: true });
  if ((await minimize.count()) === 0) return;
  await minimize.click();
  await page.locator('.chat-dock[data-open="false"]').waitFor();
}

async function sendChatMessage(page, message) {
  await page.getByPlaceholder("Say something").fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText(message).waitFor();
}

async function openChat(page) {
  await page.getByRole("button", { name: /^Open chat/ }).click();
  await page.getByRole("region", { name: "Chat" }).waitFor();
}

function contextOptions(viewport) {
  return {
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    locale: "en-US",
  };
}

/**
 * The manual's steps, photographed on a live room with one owner and one voter.
 * A private vote and a reveal need two people to show at all.
 */
async function captureManual(origin, browser) {
  mkdirSync(IMAGES_DIRECTORY, { recursive: true });

  const owner = await browser.newContext(contextOptions(DESKTOP_VIEWPORT));
  const voter = await browser.newContext(contextOptions(DESKTOP_VIEWPORT));

  try {
    const ownerPage = await owner.newPage();
    const voterPage = await voter.newPage();

    await ownerPage.goto(origin);
    const start = ownerPage.getByRole("button", { name: "Start a room", exact: true });
    await start.waitFor();
    await captureShot(ownerPage, "01-landing");

    await start.click();
    await ownerPage.waitForURL(/\/room\//);
    await ownerPage.getByRole("heading", { name: "What is your name?" }).waitFor();
    await captureShot(ownerPage, "02-name-gate");

    await enterRoom(ownerPage, "Ana");
    await minimizeChatIfOpen(ownerPage);
    const copyLink = ownerPage.getByRole("button", { name: "Copy link", exact: true });
    await copyLink.click();
    await ownerPage.getByRole("button", { name: "Copied", exact: true }).waitFor();
    await ownerPage.evaluate(() => globalThis.scrollTo(0, 0));
    await captureShot(ownerPage, "03-room-share");

    await voterPage.goto(ownerPage.url());
    await enterRoom(voterPage, "Bruno");
    await ownerPage.getByText("2 here", { exact: true }).waitFor();

    await ownerPage.locator("#session-name").fill("Sprint 42 planning");
    await ownerPage.getByRole("button", { name: "Save", exact: true }).click();

    const votePanel = ownerPage
      .getByText("Your estimate", { exact: true })
      .locator("xpath=ancestor::section[1]");
    await captureElementShot(ownerPage, votePanel, "04-voting");

    await vote(ownerPage, "3");
    await captureElementShot(ownerPage, votePanel, "05-stamped-vote");

    await vote(voterPage, "5");

    const reveal = ownerPage.getByRole("button", { name: "Reveal", exact: true });
    await captureElementShot(ownerPage, reveal.locator("xpath=ancestor::section[1]"), "06-owner-controls");

    await reveal.click();
    const revealList = ownerPage.getByRole("list", { name: "Revealed votes" });
    await revealList.waitFor();
    // The seals land one at a time on a timer, so the figure waits for the last one
    // rather than photographing the cascade half way through.
    await ownerPage.locator('[data-complete="true"]').waitFor();
    await captureElementShot(ownerPage, revealList, "07-reveal");

    await captureElementShot(ownerPage, ownerPage.locator('[data-complete="true"]'), "08-results");
    await captureElementShot(
      ownerPage,
      ownerPage.getByRole("region", { name: "People in the room" }),
      "09-people",
    );

    await sendChatMessage(voterPage, "Should we size the login work first?");
    await openChat(ownerPage);
    await sendChatMessage(ownerPage, "I would say 3.");
    await captureElementShot(ownerPage, ownerPage.getByRole("region", { name: "Chat" }), "10-chat");

    await ownerPage.getByRole("button", { name: "Delete room", exact: true }).click();
    await ownerPage.getByRole("dialog").waitFor();
    await captureShot(ownerPage, "11-confirm-dialog");
    await ownerPage.getByRole("button", { name: "Keep it", exact: true }).click();
  } finally {
    await owner.close();
    await voter.close();
  }
}

async function captureHero(origin, browser) {
  const context = await browser.newContext(contextOptions(HERO_VIEWPORT));

  try {
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "Start a room", exact: true }).waitFor();
    await captureShot(page, "hero");
  } finally {
    await context.close();
  }
}

/**
 * The font travels as a data URL inside the page because a document loaded from disk
 * cannot reach files outside its own directory in Chromium.
 */
function fontFaceRule() {
  const font = readFileSync(FONT_PATH).toString("base64");
  return `@font-face { font-family: "Space Grotesk Variable"; font-style: normal; font-weight: 300 700; src: url(data:font/woff2;base64,${font}) format("woff2-variations"); }`;
}

async function captureSocialCard(browser) {
  const context = await browser.newContext(contextOptions(SOCIAL_VIEWPORT));

  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(SOCIAL_TEMPLATE).href);
    await page.addStyleTag({ content: fontFaceRule() });
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.screenshot({ path: SOCIAL_OUTPUT, scale: "css" });
    console.log(`captured ${path.relative(REPOSITORY_ROOT, SOCIAL_OUTPUT)}`);
  } finally {
    await context.close();
  }
}

function runCompattor(arguments_) {
  const result = spawnCommandSync("compattor", arguments_);

  if (result.error?.code === "ENOENT") {
    console.log("compattor is not installed, leaving the PNGs uncompressed");
    return;
  }
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`compattor failed on ${arguments_.join(" ")}`);
}

/**
 * Lossy quantisation suits the social card, whose palette is a handful of flat
 * colours. The screenshots carry antialiased text and keep lossless.
 */
function compressImages() {
  runCompattor(["--lossless", "-w", IMAGES_DIRECTORY]);
  runCompattor(["-w", SOCIAL_OUTPUT]);
}

async function main() {
  const { target, origin: givenOrigin } = parseArguments(process.argv);
  const server = givenOrigin === null ? startDevServer() : null;
  const origin = givenOrigin ?? server?.origin ?? "";

  try {
    if (server !== null) await waitForServer(origin);

    const browser = await launchBrowser();
    try {
      if (target !== "og") {
        await captureManual(origin, browser);
        await captureHero(origin, browser);
      }
      if (target !== "manual") {
        await captureSocialCard(browser);
      }
    } finally {
      await browser.close();
    }

    compressImages();
  } finally {
    server?.stop();
  }
}

main().catch((problem) => {
  console.error(problem);
  process.exitCode = 1;
});
