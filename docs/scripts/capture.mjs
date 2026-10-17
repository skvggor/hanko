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
  const onlyIndex = argv.indexOf("--only");

  if (!["manual", "og", "all"].includes(target)) {
    throw new Error(`unknown capture target "${target}" (expected manual, og or all)`);
  }

  if (onlyIndex !== -1) {
    const raw = argv[onlyIndex + 1] ?? "";
    for (const figure of raw.split(",")) {
      if (figure.trim() !== "") ONLY_FIGURES.add(figure.trim());
    }
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

async function captureShot(page, name, { pointer = "park" } = {}) {
  if (ONLY_FIGURES.size > 0 && !ONLY_FIGURES.has(name)) return;
  await page.evaluate(() => globalThis.document.fonts.ready);
  // The pointer stays where the last click left it, and a card still hovered under
  // the cursor photographs as a hover the reader never triggered. Held is the
  // exception, for the one thing that only exists under the cursor: a tooltip.
  if (pointer === "park") await page.mouse.move(0, 0);
  const target = path.join(IMAGES_DIRECTORY, `${name}.png`);
  await page.screenshot({ path: target, scale: "css" });
  console.log(`captured ${path.relative(REPOSITORY_ROOT, target)}`);
}

async function captureElementShot(page, element, name, { pointer = "park" } = {}) {
  if (ONLY_FIGURES.size > 0 && !ONLY_FIGURES.has(name)) return;
  // Centring keeps the pinned header and footer from landing on top of the figure,
  // which is what a plain scroll into view leaves behind.
  await element.evaluate((node) => node.scrollIntoView({ block: "center" }));
  if (pointer === "park") await page.mouse.move(0, 0);
  const target = path.join(IMAGES_DIRECTORY, `${name}.png`);
  await element.screenshot({ path: target, scale: "css" });
  console.log(`captured ${path.relative(REPOSITORY_ROOT, target)}`);
}

/**
 * Frames the cat together with its two controls, which hang below it. At room scale
 * those buttons are 1.5rem — a figure of the whole room photographs them as specks —
 * so this crops to the cat plus its controls with enough margin to read both.
 */
async function captureCatControls(page, name) {
  if (ONLY_FIGURES.size > 0 && !ONLY_FIGURES.has(name)) return;
  const composerStyle = await page.addStyleTag({
    content: ".cat-composer { visibility: hidden !important; }",
  });
  const clip = await page.evaluate(() => {
    const cat = globalThis.document.querySelector(".cat");
    const controls = cat?.querySelector(".cat-controls");
    const catRect = cat?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    if (catRect === undefined || controlsRect === undefined) return null;

    const marginTop = 80;
    const marginBottom = 4;
    const marginX = 80;
    const left = Math.min(catRect.left, controlsRect.left);
    const top = Math.min(catRect.top, controlsRect.top);
    const right = Math.max(catRect.right, controlsRect.right);
    const bottom = Math.max(catRect.bottom, controlsRect.bottom);

    return {
      x: Math.max(0, Math.round(left - marginX)),
      y: Math.max(0, Math.round(top - marginTop)),
      width: Math.round(right - left + marginX * 2),
      height: Math.round(bottom - top + marginTop + marginBottom),
    };
  });

  if (clip === null) throw new Error("the cat and its controls are not on the page");
  const target = path.join(IMAGES_DIRECTORY, `${name}.png`);
  await page.screenshot({ path: target, clip, scale: "css" });
  await composerStyle.evaluate((style) => style.remove());
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
  // The sentence now lives in more than one place: the speaker's own cat wears it as a
  // bubble, and the transcript announces the newest line for anybody who cannot see it.
  // Asking for the text alone matches both and is an ambiguity, so this waits on the
  // first of them this layout actually rendered.
  await page
    .locator(".speech-bubble__text, div[role='log'][aria-live='polite']", {
      hasText: message,
    })
    .first()
    .waitFor();
}

/**
 * The room shows one composer or the other depending on the pointer, so this waits on
 * the field both of them render. Waiting on the chat panel instead would only ever
 * match the branch a desktop screenshot is not on.
 */
async function waitForComposer(page) {
  await page.getByPlaceholder("Say something").waitFor();
}

async function openChat(page) {
  // Only the docked panel has a launcher to press; where the cats are up, the
  // composer is already on screen and there is nothing to open.
  const launcher = page.getByRole("button", { name: /^Open chat/ });
  if ((await launcher.count()) > 0) await launcher.click();
  await waitForComposer(page);
}

/**
 * The transcript is the one surface that carries a notice the reader has to act on,
 * and it is shown once per browser rather than at every opening, so a capture that
 * wants the notice has to be the first thing this context opens.
 */
async function openTranscript(page) {
  await page.getByRole("button", { name: "Read the conversation", exact: true }).click();
  await page.locator('.chat-transcript[data-open="true"]').waitFor();
}

async function closeTranscript(page) {
  await page.getByRole("button", { name: "Close the conversation", exact: true }).click();
  await page.getByRole("button", { name: "Read the conversation", exact: true }).waitFor();
}

async function dismissPrivacyNotice(page) {
  await page.getByRole("button", { name: "Understood", exact: true }).click();
  await page.locator('[data-role="warning"]').waitFor({ state: "detached" });
}

/**
 * The frame can arrive before its CSS transition does. Watching inline styles only caught
 * the destination while the cat was still crossing the board, so a photograph could show
 * it over the very content the broom had cleared. Wait for the browser's running movement
 * animations to finish before opening the shutter.
 */
async function readCatPositions(page) {
  return page.locator(".cat").evaluateAll((cats) =>
    cats.map((cat) => `${cat.style.left}|${cat.style.top}|${cat.style.transform}`),
  );
}

async function waitForCatsToSettle(page, positionsBeforeMove) {
  await page.waitForFunction((previous) => {
    const cats = [...globalThis.document.querySelectorAll(".cat")];
    const current = cats.map((cat) => `${cat.style.left}|${cat.style.top}|${cat.style.transform}`);
    return cats.length === previous.length && current.some((position, index) => position !== previous[index]);
  }, positionsBeforeMove);

  await page.waitForFunction(() => {
    const cats = [...globalThis.document.querySelectorAll(".cat")];
    return (
      cats.length > 0 &&
      cats.every((cat) =>
        cat
          .getAnimations()
          .filter((animation) => "transitionProperty" in animation)
          .every((animation) => animation.playState !== "running"),
      )
    );
  });
}

/**
 * Holding a cat takes the keyboard, and the ring and the name only appear while the
 * focus is on it, so the click has to be a real one and the figure taken before
 * anything else takes the focus back.
 */
async function takeHoldOfOwnCat(page) {
  await page.locator('[data-controllable="true"] .cat__button').click();
  await page.locator('[data-driving="true"]').waitFor();
  // The controls fade in over ~120ms once the cat is driven; waiting on the attribute
  // only is enough to land mid-fade, and the shutter catches the remove button invisible.
  await whenControlsOpaque(page, "[data-driving='true'] .cat-controls");
}

/**
 * Hides the cats for a single figure and puts them straight back afterwards. The chat
 * figure is about the conversation, and a cat the owner holds — which the room grabs
 * for itself on a timer — parks its pause/remove buttons on top of the composer, which
 * photographs as clutter the reader has to look past. Only this one figure does it; the
 * room behind the composer is untouched.
 */
async function setCatsHidden(page, hidden) {
  await page.evaluate((shouldHide) => {
    let style = globalThis.document.getElementById("hanko-hide-cats");
    if (shouldHide && style === null) {
      style = globalThis.document.createElement("style");
      style.id = "hanko-hide-cats";
      style.textContent = ".cat { display: none; }";
      globalThis.document.head.append(style);
    } else if (!shouldHide && style !== null) {
      style.remove();
    }
  }, hidden);
}

/**
 * The cat controls begin at opacity 0 and ride a 120ms transition to 1, whether the
 * fade is started by driving the cat or by hovering it. Playwright knows the attribute
 * is set, not that the transition has finished, so a figure taken too soon photographs
 * the buttons (the remove X most of all) as absent. This pins the shutter to the moment
 * the strip is fully painted.
 */
async function whenControlsOpaque(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const el = globalThis.document.querySelector(sel);
      if (el === null) return false;
      return parseFloat(globalThis.getComputedStyle(el).opacity) >= 1;
    },
    selector,
    { timeout: 1500 },
  );
}

function contextOptions(viewport) {
  return {
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    locale: "en-US",
    // The room now says so when the clipboard refuses rather than pretending it worked,
    // and a headless Chromium refuses by default. Without this the share figure waits
    // forever for a "Copied" that the app is being honest about not being able to give.
    permissions: ["clipboard-read", "clipboard-write"],
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
    // Whichever composer this viewport ended up with, is the thing worth showing. The
    // cats are put away for this one: a cat the room grabs for itself parks its buttons
    // on the composer, which photographs as clutter.
    await setCatsHidden(ownerPage, true);
    await captureElementShot(
      ownerPage,
      ownerPage.locator(".chat-panel, .cat-composer").first(),
      "10-chat",
    );
    await setCatsHidden(ownerPage, false);

    // The transcript, which is where the room says out loud that it is not private.
    // Opened first in this context on purpose: the notice is shown once per browser,
    // so a figure of it only exists the first time anybody reads the conversation.
    await openTranscript(ownerPage);
    await captureShot(ownerPage, "12-chat-warning");
    await dismissPrivacyNotice(ownerPage);
    await captureShot(ownerPage, "13-chat-transcript");
    await closeTranscript(ownerPage);

    // Clearing the conversation is the one erasing control that was left unconfirmed,
    // and the figure is the question rather than the answer.
    const clearChat = ownerPage.getByRole("button", {
      name: "Clear the conversation for everyone",
      exact: true,
    });
    await clearChat.click();
    await ownerPage.getByRole("dialog").waitFor();
    await captureShot(ownerPage, "14-clear-chat-confirm");
    await ownerPage.getByRole("button", { name: "Keep it", exact: true }).click();

    // The ring and the cat's own name, which the keyboard deserves and nothing else.
    await takeHoldOfOwnCat(ownerPage);
    await captureShot(ownerPage, "15-driving-your-cat");
    await ownerPage.locator('[data-driving="true"] .cat__button').press("Escape");

    // The two buttons under the cat, photographed while it is back in its lane and both
    // controls are on screen. Resting state, no hover, so the X stays ink on paper. Shot
    // as an element rather than the whole room: at room scale two 1.5rem buttons vanish.
    const sendAway = ownerPage.getByRole("button", {
      name: "Send this cat away for good",
      exact: true,
    });
    await ownerPage.locator(".cat__button").first().evaluate((button) => button.blur());
    await ownerPage.locator(".cat").first().hover();
    await whenControlsOpaque(ownerPage, ".cat-controls");
    // The released cat glides back to its lane over a 700ms left/top transition; give
    // it that and a little more before framing it, or the crop lands on an empty corner.
    await ownerPage.waitForTimeout(800);
    await captureCatControls(ownerPage, "17-send-cat-away");

    // The broom, with two cats it is worth pressing at all.
    const positionsBeforeShoo = await readCatPositions(ownerPage);
    await ownerPage
      .getByRole("button", { name: "Shoo everyone's cats to the edges", exact: true })
      .click();
    await waitForCatsToSettle(ownerPage, positionsBeforeShoo);
    await captureShot(ownerPage, "16-cats-to-the-edges");

    // The permanent removal asks first, so the figure records the confirmation before
    // answering it. The control figure above remains separate from this question.
    await sendAway.click();
    await ownerPage.getByRole("dialog").waitFor();
    await captureShot(ownerPage, "20-cat-remove-confirm");
    await ownerPage.getByRole("button", { name: "Send it away", exact: true }).click();
    await ownerPage
      .getByRole("button", { name: "Shoo everyone's cats to the edges", exact: true })
      .waitFor({ state: "detached" });
    await captureShot(ownerPage, "18-cat-sent-away");

    await ownerPage.getByRole("button", { name: "Delete room", exact: true }).click();
    await ownerPage.getByRole("dialog").waitFor();
    await captureShot(ownerPage, "11-confirm-dialog");
    await ownerPage.getByRole("button", { name: "Keep it", exact: true }).click();
  } finally {
    await owner.close();
    await voter.close();
  }
}

/**
 * Coming back to a room. The name is kept per browser, so the gate says who was here
 * instead of opening blank and leaving the reader to wonder why their room is not
 * waiting for them. Reloading the same address is all it takes: no leaving, no second
 * room, and the server has still got the seat because the grace window is open.
 */
async function captureReturning(origin, browser) {
  const context = await browser.newContext(contextOptions(DESKTOP_VIEWPORT));

  try {
    const page = await context.newPage();

    await page.goto(origin);
    await page.getByRole("button", { name: "Start a room", exact: true }).click();
    await page.waitForURL(/\/room\//);
    await enterRoom(page, "Ana");
    await page.getByText("Round 1", { exact: true }).waitFor();

    await page.reload();
    await page.getByRole("heading", { name: "What is your name?" }).waitFor();
    await captureShot(page, "19-coming-back");
  } finally {
    await context.close();
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
 * Figures the shutter is allowed to take. Empty means "every figure": when set, the
 * capture still walks through all the interactions that lead each one up (so a room
 * reaches the state a late figure needs), but only writes the PNGs whose name is listed.
 * The cat animation is non-deterministic, so this keeps a good sample of 01-14/18-19
 * from being overwritten while one broken figure is re-shot.
 */
const ONLY_FIGURES = new Set();

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
        await captureReturning(origin, browser);
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
