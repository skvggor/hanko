# AGENTS.md

Guidance for AI agents and humans working in this repository.

## What Hanko is

Room based planning poker. A team opens a room, shares the link, everyone picks a card
privately, and the room owner reveals. There are no accounts: **the room id is the only
secret** guarding a room.

It runs entirely on Cloudflare Workers. State lives in one Durable Object per room and is
pushed to clients over a WebSocket, so the UI never polls and a vote is never in the
server-rendered HTML.

The visual language is the Japanese seal stamp ("hanko"): ink, paper, and a stamp that
lands on the vote grid at reveal time. Keep new UI consistent with that metaphor rather
than reaching for generic dashboard patterns.

## Stack

Vite, React and TypeScript on the client, Cloudflare Workers and Durable Objects on the
server, Tailwind for styling, Vitest and Testing Library for tests, ESLint flat config,
Lefthook for the hooks. Read `package.json` for the versions. Routing, state management,
i18n and validation are all hand written.

Runtime dependencies are deliberately few: React, React DOM, Phosphor icons, GSAP and the
self-hosted Space Grotesk variable font. Do not add a dependency for something that is a
page of code.

GSAP is the one exception to "hand written", and it earns its place by carrying the seal's
morph, which is a timeline of per character tweens rather than a two state transition. It
arrives as a default parameter instead of a global, the same seam as
`createDefaultSocketFactory()`, so `InkStamp` can be rendered and asserted in jsdom without
a timeline running underneath it. Core only: no `SplitText`, because splitting text into
spans GSAP owns is a fight with React for the same nodes.

`package.json` has an `allowScripts` allowlist for `esbuild`, `workerd` and `lefthook`. Do
not remove it: their postinstall binaries are required for the build.

## Commands

```bash
npm run dev            # vite dev server with the Worker running locally
npm run build          # tsc --noEmit && vite build
npm run typecheck      # BOTH tsconfigs: client and worker
npm run lint           # eslint .
npm test               # vitest run
npm run test:coverage  # vitest run --coverage (enforces the 80% gate)
npm run sonar          # SonarQube gate on a throwaway instance (needs Docker)
npm run deploy         # coverage, then build, then wrangler deploy
```

`pre-commit` runs ESLint on staged files with `--max-warnings=0`, both `tsc --noEmit`
passes, the coverage run and a secret scan. `pre-push` runs the same gates plus the
production build and `npm run sonar` across the whole tree. `typecheck`, `lint`,
`test:coverage` and `npm run sonar` must all be green before a change is done.

`npm run build` only typechecks the client config, so run the full `typecheck` rather than
relying on `build`.

The sonar gate brings up its own instance in Docker and takes it down again, so a push
needs the daemon running. Set `SONAR_KEEP_ALIVE=1` to leave the instance up at
`http://localhost:9000`, signing in as `admin`/`admin`; it is then yours to remove with
`docker rm -f hanko-sonar`.

## Architecture

Five layers, each a path alias, with the dependency direction a one way street:

```
domain  <-  application  <-  presentation
   ^
   |
 infra
```

| Alias           | Folder             | May import                        |
| --------------- | ------------------ | --------------------------------- |
| `@domain`       | `src/domain`       | only `@domain/*`                  |
| `@application`  | `src/application`  | `@domain/*`, `@application/*`     |
| `@infra`        | `src/infra`        | `@domain/*`, `@infra/*`           |
| `@presentation` | `src/presentation` | all three, plus `@presentation/*` |
| `@config`       | `src/config`       | nothing                           |

`@presentation` and `@infra` never import each other, so the client bundle cannot reach
server code and the Worker bundle cannot reach React.

- **`@domain`** is pure business rules with zero dependencies outside itself: no platform
  APIs, no clocks, no randomness, no network. `room.ts` is the aggregate, `protocol.ts` the
  wire types and `toPublicState`, the rest are value objects, validation and tallying. A
  rule belongs here only if it can be decided without knowing about HTTP, WebSockets,
  Durable Objects or React.
- **`@application`** is orchestration and client side read models. `roomConnection.ts`
  owns the WebSocket lifecycle; every `onX` there returns an unsubscribe closure.
- **`@infra`** is adapters. `worker.ts` is the entry point and the router, `server.ts` is
  the `Room` Durable Object with its dispatch, persistence, broadcast, rate limits and
  expiry alarms. Auth is the socket's `serializeAttachment` payload
  (`{ participantId, token }`, with an `ANONYMOUS` sentinel); tokens live in
  `sessionStorage` and are tombstoned on removal.
- **`@presentation`** is React. `RoomScreen.tsx` is the only place that constructs a
  `RoomConnection` and owns all mutable state; everything below it takes data and
  callbacks. Every component exports an explicit props interface and receives
  `translate: Translator` as a prop. There is no context, no global i18n singleton and no
  store.

The cat overlay is the one place where that rule is worth spelling out. The Durable Object
mints a `CatState` per participant and publishes positions on their own `cat-state` frame,
never as part of a state push, so a cat crossing the screen cannot re-render the board. On
the client, `CatOverlay.tsx` renders the cats and `useControlledCat.ts` owns the state
machine that the four arrow keys and the space bar drive; nothing about walking lives in a
component. `RoomScreen.tsx` swaps the whole overlay for `ChatPanel` on a coarse pointer,
which is why there are two composers and only one of them is ever on screen. The keyboard
belongs to the cat that holds the focus and to nothing else, because the arrow keys also
scroll and the space bar also presses buttons.

Two things follow from that swap, and both were got wrong once. A person's own cat is
drawn from local state, because the server never echoes their movement back, so the one
case where the room does move it has to be adopted explicitly and only while it is held:
a cat nobody is holding already reads the room's own number. And the broom belongs to
`RoomScreen`, not to the overlay, because the overlay is not rendered on a coarse pointer
at all and the cats it moves are very much still standing on everybody else's screen.

The chat has the same two composers and one more shared component. `ChatMessages` renders
the transcript for the dock and the transcript panel alike, so a message reads the same in
both, and what somebody said outlives their seat: reclaiming a seat keeps their messages,
because the transcript is only worth having if a person who left still said it.

Two entry points, which is why there are two tsconfigs: `presentation/main.tsx` for the
SPA, mounted from `index.html` onto `#root`, and `infra/worker.ts`, named in
`wrangler.jsonc` as `main`. `infra` compiles under `tsconfig.worker.json`, which excludes
`src/presentation`, so a stray import fails typecheck rather than bloating the Worker.

Client routing is hand rolled against the History API. Cloudflare's
`not_found_handling: "single-page-application"` is what makes deep links work, so do not
add a server side route to render them.

## Path aliases are mandatory

Import through the alias, never relatively. Only two relative imports exist in production
code and both are deliberate: `domain/room.ts` importing `./deck`, and `i18n.ts`
importing the locale JSON because `locales/` has no alias.

Adding a layer means updating **three** files: `aliases.ts` (read by both `vite.config.ts`
and `vitest.config.ts`), `tsconfig.json` `paths`, and `tsconfig.worker.json` `paths`.

## Code conventions

### Naming

camelCase files throughout, including components. Components are named function exports
with an explicit props interface, never default exports; the single default export in the
repo is the Worker itself. Module constants are SCREAMING_SNAKE_CASE and live next to the
concept they belong to. Private class members use `#` fields. There are no barrel
`index.ts` files.

Spelling things out is a real preference: `roomId`, `participantId`, `translate`. Storage
keys are namespaced with `hanko:`.

### Errors are return values, not exceptions

Domain transitions never throw. "Nothing changed" is signalled by returning the **same
reference**, which the tests assert directly. Validation returns a discriminated union
plus a thin boolean wrapper for callers who only need the yes or no:

```ts
export type NameValidationResult =
  | { valid: true; name: string }
  | { valid: false; reason: "empty" | "too_long" | "invalid_characters" };

export function validateName(rawName: string): NameValidationResult { ... }
export function isValidName(rawName: string): boolean { return validateName(rawName).valid; }
```

The one sanctioned exception is a typed error class carrying a reason union, at network
boundaries: `CreateRoomError`. Callers narrow on it and rethrow what they do not
recognise. Server side, failures leave as protocol frames rather than HTTP errors.

### Dependency injection without a container

Inject through a defaulted parameter. No container, no interface-for-everything:

```ts
export async function createRoom(fetchImpl: typeof fetch = globalThis.fetch): Promise<string>
constructor(private readonly roomId: string,
            private readonly socketFactory: SocketFactory = createDefaultSocketFactory()) {}
```

### Comments explain why, in prose

This is the strongest convention in the repo. Comments are complete sentences that
explain the reasoning and often the rejected alternative. There are no `// TODO`, no
comments restating the code, and no commented-out blocks.

The corollary is worth stating because it is the half that gets forgotten: a comment that
earns nothing goes. One or two sentences carrying the decision and the alternative it
replaces is the target, and a block that has grown to restate the mechanism around it is
worse than nothing, because it goes stale silently while the code beside it does not. A
field doc that restates its own type, a prop comment that names the prop, or a comment on a
line that says what the line says are all noise; delete them rather than shortening them.

```ts
/**
 * Removal has to hold, otherwise the person just reloads with the token still in
 * sessionStorage and walks straight back in. The tombstone is capped because the
 * room only needs to outlive a reconnect, not remember people forever.
 */
```

If you change a rule that has such a comment, update the comment with it. Explain the
trade-off, not the mechanism. The same applies to this file: state the rule, not the story
of how it arrived.

### TypeScript

Both configs enable `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
`isolatedModules` and `noUnusedLocals`/`noUnusedParameters`.

`noUncheckedIndexedAccess` means `array[0]` is `T | undefined`. Do not work around it with
`!`. Zero `any` in the repository, zero `eslint-disable`, zero `@ts-ignore`; use
`as never` or `as unknown as X` for platform fakes in tests.

`no-console` is a warning outside `src/infra` and disabled inside it, and the hook runs
with `--max-warnings=0`, so a stray `console.log` fails the commit.

### Styling and accessibility

Tailwind utilities inline, plus `styles/theme.css` for animation and stateful pieces.
Tokens are CSS variables surfaced through `@theme` (`bg-paper`, `text-ink-dim`,
`border-line`, `text-primary`, `font-display`, `rounded-chip`).

The root font size is fluid and everything else is sized in rem against it, so one value
carries the interface from a phone to a large display. A pixel opts that piece out of the
scaling. `presentation/typography.test.ts` refuses pixel font sizes in components and in
the stylesheet; one pixel hairlines and focus outlines are the deliberate exceptions,
because a hairline should stay a hairline and a focus ring should stay legible.

Spacing comes from the named steps declared in `@theme`, not from raw numbers above 8px.
`presentation/spacing.test.ts` enforces that in components and in the stylesheet. Values
below 8px stay numeric because those are optical corrections rather than rhythm.

`Shell.tsx` pins the header and footer and centres only the content between them. The two
bars share one rem based height token so they stay equal at any root size, and the
`[data-frame]` element inside `main` caps the measure so a line never runs the width of the
display. Pinned chrome takes a frosted background through `data-glass` when there is
something behind it to blur.

Destructive actions confirm first. `ConfirmDialog` opens focused on the safe answer and
hands focus back to whatever opened it. Dialogs are ours: `prompt`, `confirm` and `alert`
are refused by `presentation/dialogs.test.ts`, which also requires the app to carry its
own replacement.

Accessibility is a requirement, not polish. Every icon gets `aria-hidden`, every icon only
button an `aria-label`, errors `role="alert"`, chat `role="log"`, the meter a native
`<progress>`, toggles `aria-pressed`, screen reader only text
the `visually-hidden` utility. Motion is gated on `prefers-reduced-motion`, which `Shell`
reflects onto `data-reduced-motion`. Fonts are self hosted with hand written `@font-face`
blocks declaring only the `latin` and `latin-ext` subsets.

## Testing

### The loop is red, green, refactor

Every feature and every fix starts with a test that fails. Writing the test afterwards to
match the code that already exists does not satisfy this.

1. **Red.** Write the smallest test that describes the behaviour you are about to add and
   run it. It has to fail *because the behaviour is missing* — a typo or a bad import is a
   broken test, not a red step.
2. **Green.** Write the least code that makes it pass. The test is the specification, so
   passing it means implementing the behaviour. Hardcoding an expectation, relaxing the
   assertion or widening the type are all ways of buying a green run with nothing behind
   it.
3. **Refactor.** Clean up duplication and naming with the test green. Refactoring is not
   permission to change behaviour: a new behaviour is a new test and a new cycle.

If the code was written first, write the test that would have caught it, delete the
implementation, watch it go red, and put it back. That round trip is what separates a test
that measures behaviour from one that merely agrees with the code.

The gates catch mistakes after the fact. None of them can tell you a feature was never
specified, so the cycle is the only thing standing between an untested feature and a build
that is confidently green.

### Conventions

Tests are co-located: `foo.ts` gets `foo.test.ts`. The environment is jsdom for everything,
including the Worker and Durable Object tests, which run against hand rolled fakes rather
than workerd.

Coverage is gated at 80% on statements, branches, functions and lines, across every layer.
A layer left out of the gate is a layer where a regression is free, so adding a layer means
adding it to the thresholds. The thresholds are on the total, so check a new file's own
numbers rather than assuming the aggregate speaks for it.

### What the sonar gate is for

Everything else here reads one file at a time, which is why the coverage gate never found
the same function written out twice in two files and why the analyser found a conditional
in the result sheet whose two branches were identical. `npm run sonar` is the one gate that
sees across files, and it is the only reason duplication is not invisible here.

The instance exists for one analysis and is destroyed with it, so what outlives a run is the
exit code and nothing else. That is deliberate: there is no server to keep in sync and no
dashboard to forget about. The cost is that a gate on a database with no history has no
"new code" period, so every condition applies to the whole repository. A fresh
implementation therefore has to meet the bar of the entire codebase.

Every finding blocks the push: bugs, vulnerabilities, code smells and duplicated lines
each carry a condition of their own, and the thresholds in `scripts/sonar-scan.mjs` sit at
zero. A push with anything left to fix cannot happen, which is the promise the gate
exists to keep. A threshold only ever moves down, and a move is a deliberate edit that
shows up in the diff next to the reason. Raising one to make a run pass defeats the
gate, and the run passing is not the point of it.

Test names are behavioural sentences in the present tense: `"refuses a full room"`,
`"keeps the seat of someone who just left"`.

There is no shared test helper module and no mocking library. Each file declares its own
factories, which is deliberate: `function state(overrides): PublicRoomState` in every
presentation test, `createFakeSocket()` and `createFakeStorage()` in infra,
`renderRoom()` style helpers returning `{ handlers }`. Module level mocks use `vi.hoisted`
plus `vi.mock`; globals go through `vi.stubGlobal` and are cleared with
`vi.unstubAllGlobals()` in `afterEach`.

Assert with `toBe`, `toBeTruthy`, `toHaveLength` and `container.querySelector`.
`toBeInTheDocument` is not the house style even though jest-dom is set up. `data-*`
attributes such as `[data-phase]`, `[data-open]`, `[data-consensus]`, `[data-copied]` and
`[data-role]` are part of the test contract: when you add state a test needs to see, add
the attribute too.

Fixtures carry realistic values rather than invented ones, because the app derives share
links from `location.origin` at runtime and an invented host reads as a claim about where
the app runs. Regressions get a comment naming the original bug.

## Internationalisation

`locales/en-US/translations.json` and `locales/pt-BR/translations.json`, addressed by dot
path, resolved by `application/i18n.ts`. `translate` is passed down as a prop from
`Root.tsx`; never import a dictionary inside a component.

Adding a key means adding it to **both** files with matching `{{variable}}` names.
`i18n.test.ts` enforces key parity and placeholder hygiene. Missing keys return the path
itself rather than throwing. Keys are namespaced (`join`, `welcome`, `room`, `controls`,
`vote`, `errors`, `a11y`, `landing`, `brand`, `result`, `progress`, `consensus`, `chat`,
`session`, `cat`) and error codes map onto `errors.<code>` dynamically.

The selected locale persists under `localStorage["hanko:locale"]`. Storage access is
wrapped in `try/catch` because it can be denied by the browser.

## Security notes

The threat model is the weak one and the code takes it seriously: no accounts, room id is
the only secret, so guessing or leaking an id is the attack. When touching this code, keep
these properties intact:

- Room ids are drawn from `domain/roomId.ts`, which is the single source for the alphabet
  and the length. Accepting an id the generator cannot mint means accepting a shape of link
  that looks like a room without being one.
- Votes are hidden server side until reveal, and a vote is only ever returned for a token
  the caller actually presents. A regression test guards this; do not relax it to make a
  fixture easier to build.
- WebSocket upgrades validate `Origin`, refusing a missing one as a non browser client to
  block cross site WebSocket hijacking.
- The chat is not encrypted and the interface says so once per browser, because anyone
  holding the room link reads the room and pretending otherwise is the only lie that
  would matter here. Keep that warning next to the chat rather than only in a README.
- Chat, commands, cat movement, the shoo and the public state endpoint each have their own
  per window rate limit, and `MAX_SOCKETS` caps sockets per room. The state endpoint is keyed
  by caller rather than by room, because the room is shared: without a key one person
  looping over it would spend everybody else's budget. Nothing in the app reads that
  endpoint, so the limit is there to bound cost, not to serve a polling client.
- A dropped WebSocket is chased rather than reported. The room keeps the seat for the
  whole grace window, so the client retries on the token it was issued, backing off from
  half a second to thirty before it admits the connection is gone and offers a retry.
  A deliberate `close()` is not a fault and must never start that chase.
- A client command names a target or it does not. `remove-cat` carries no participant id
  at all, because the server reads who is asking off the socket and a field naming a
  target would put the decision in the hands of whoever holds the keyboard. `remove-participant`
  does carry one, because kicking somebody is the owner's to decide.
- Linkification matches the scheme. Only `http` and `https` become a link; a loose shape
  followed by a scheme check would let a chat message become a `javascript:` href, which is
  a hole in a page that has no other reason to trust the text.
- Reclaiming a seat does not tombstone the token. `removeParticipant` does, so a kick
  cannot be undone by a reload; a five minute timeout deliberately does not, because the
  point of the grace window is that the person can come back and the stored name gets them
  in through the ordinary join.
- `public/_headers` carries the CSP and the other response headers, and Workers parses it
  on deploy. A comment is a line beginning with `#`; there is no block comment syntax, and
  a header must be indented under a URL pattern. Getting that wrong fails the deploy at the
  API rather than shipping silently. `infra/headers.test.ts` enforces the shape.

## Commits

Write the history the way the existing commits read: a capitalised imperative subject,
then a prose body wrapped at about 75 columns explaining **why**, not a list of what
changed. Reach for a bullet list only when the thing being enumerated is a list. There are
no `feat:`, `fix:` or `chore:` prefixes in this repository.

An agent never signs its own work. No `Co-Authored-By` trailer, no `Generated with` line,
no trailer naming a model or a tool. The person who asked for the change is its author,
and an attribution trailer only follows every future `git blame`.

Never commit unless you were asked to in this conversation, and never push unless you were
asked to as well. Those are separate permissions. Leave the working tree as you found it
and say plainly what you changed.

Do not reach for `--no-verify`. The hooks are why this repository can quote coverage and
lint numbers at all, so a commit that skipped them is a hole in that claim. Fix the
underlying failure instead.

## Deploying

`npm run deploy` runs the coverage gate, then `build`, then `wrangler deploy`, so a
Durable Object bundle is never replaced by a commit whose tests never ran.

Changes to the `Room` Durable Object's storage shape need a migration entry in
`wrangler.jsonc`; the existing one is tagged `v1`. An *added* field does not: a migration
transforms stored data, and data without the field is still valid data. `restoreRoom`
backfills instead, and each of those fields carries a regression test that loads a snapshot
stored before it existed. Reshaping data that is already written, or dropping a field
people's rooms depend on, is a migration.
