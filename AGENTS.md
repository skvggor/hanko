# AGENTS.md

Guidance for AI agents and humans working in this repository.

## What Hanko is

Room based planning poker. A team opens a room, shares the link, everyone picks a card
privately, and the room owner reveals. There are no accounts: **the room id is the only
secret** guarding a room, and the reveal is exclusive to the room owner.

The whole product runs on Cloudflare Workers. State lives in a single Durable Object per
room and is pushed to clients over a WebSocket, so the UI never polls and a vote is never
visible to the server-rendered HTML.

The visual language is the Japanese seal stamp ("hanko"): ink, paper, and a stamp that
lands on the vote grid at reveal time. Keep new UI consistent with that metaphor rather
than reaching for generic dashboard patterns.

## Stack

Vite, React and TypeScript on the client, Cloudflare Workers and Durable Objects on the
server, Tailwind for styling, Vitest and Testing Library for tests, ESLint flat config,
Lefthook for the hooks. Read `package.json` for the versions. Routing, state management,
i18n and validation are all hand written; there is no router library, no state library and
no i18n library.

Runtime dependencies are deliberately few: React, React DOM, Phosphor icons and the
self-hosted Space Grotesk variable font. Do not add a dependency for something that is a
page of code.

`package.json` has an `allowScripts` block opt-in allowlist for `esbuild`, `workerd` and
`lefthook`. Do not remove it: their postinstall binaries are required for the build.

## Commands

```bash
npm run dev            # vite dev server with the Worker running locally
npm run build          # tsc --noEmit && vite build
npm run typecheck      # BOTH tsconfigs: client and worker
npm run lint           # eslint .
npm run lint:fix       # eslint . --fix
npm test               # vitest run
npm run test:coverage  # vitest run --coverage (enforces the 80% gate)
npm run deploy         # coverage, then build, then wrangler deploy
```

Two Lefthook hooks. `pre-commit` runs ESLint on staged files with `--max-warnings=0`, both
`tsc --noEmit` passes, the full coverage run, and a secret scan over the staged diff.
`pre-push` runs lint, both typecheck passes, coverage and the production build across the
whole tree, which is what catches a branch carrying a commit whose staged file was clean
but whose neighbours were not.
`npm run typecheck`, `npm run lint` and `npm run test:coverage` must all be green before
you consider a change done.

Note that `npm run build` only typechecks the client config. The worker config is checked
by `npm run typecheck` and by the hook, so run the full `typecheck`, not just `build`.

## Architecture

Five layers, each a path alias. The dependency direction is a one way street:

```
domain  <-  application  <-  presentation
   ^
   |
 infra
```

| Alias           | Folder               | May import                            |
| --------------- | -------------------- | ------------------------------------- |
| `@domain`       | `src/domain`         | only `@domain/*`                      |
| `@application`  | `src/application`    | `@domain/*`, `@application/*`         |
| `@infra`        | `src/infra`          | `@domain/*`, `@infra/*`               |
| `@presentation` | `src/presentation`   | all three, plus `@presentation/*`     |
| `@config`       | `src/config`         | nothing                               |

`@presentation` and `@infra` never import each other. The client bundle must not be able
to reach server code, and the Worker bundle must not be able to reach React or the DOM.
`@infra` compiles under `tsconfig.worker.json`, which excludes `src/presentation`, so a
stray import fails typecheck rather than silently bloating the Worker.

### `@domain` — pure business rules

Zero dependencies outside `@domain`. No platform APIs, no clocks, no randomness, no
network. Everything is a pure function `(room, ...) => RoomSnapshot`, which is what makes
the layer trivially testable.

- `room.ts` — the `RoomSnapshot` aggregate and all its transitions
- `protocol.ts` — wire types, runtime guards, and `toPublicState`, the single place that
  projects the internal snapshot into a leak free DTO
- `deck.ts`, `name.ts`, `sessionName.ts`, `chat.ts` — value objects and validation
- `tally.ts` — reveal statistics and consensus

A new rule belongs here only if it can be decided without knowing about HTTP, WebSockets,
Durable Objects or React.

### `@application` — use cases

Orchestration and client side read models. `roomConnection.ts` owns the WebSocket
lifecycle and exposes a listener registry where every `onX` returns an unsubscribe
closure. The rest are small helpers: `createRoom`, `routing`, `i18n`, `localePreference`,
`votedState`.

### `@infra` — adapters

`worker.ts` is the entry point and the router: `/api/room/create` mints an id, everything
else under `/api/room/<id>/` is rewritten and forwarded to the Durable Object. `server.ts`
is the `Room` Durable Object and holds the WebSocket dispatch, persistence, broadcast,
rate limits and expiry alarms.

Auth is the socket's `serializeAttachment` payload: `{ participantId, token }`, with an
`ANONYMOUS` sentinel. Tokens live in `sessionStorage` and are tombstoned on removal so a
reload with a stale token cannot walk back in.

### `@presentation` — React UI

One container, many presentational components. `RoomScreen.tsx` is the only place that
constructs a `RoomConnection`; it owns all mutable state and wires the handlers down as
`onX` props. Components below it take data and callbacks. Adding a second place that
opens a connection splits the state that only the container can see.

Every component exports an explicit props interface and receives `translate: Translator`
as a prop. There is no context, no global i18n singleton and no store.

### Entry points

Two of them, which is why there are two tsconfigs:

- `src/presentation/main.tsx` — the SPA, mounted from `index.html` onto `#root`
- `src/infra/worker.ts` — the Worker, named in `wrangler.jsonc` as `main`

Client routing is hand rolled in `application/routing.ts` against the History API.
Cloudflare's `not_found_handling: "single-page-application"` is what makes deep links into
`/room/<id>` work, so do not add a server side route to render those.

## Path aliases are mandatory

Import through the alias, never relatively. Only two relative imports exist in production
code and both are deliberate: `domain/room.ts` importing `./deck` from its own folder, and
`i18n.ts` importing the locale JSON because `locales/` has no alias.

Adding a layer means updating **three** files: `aliases.ts` (the source of truth read by
both `vite.config.ts` and `vitest.config.ts`), `tsconfig.json` `paths`, and
`tsconfig.worker.json` `paths`. Miss one and you get a confusing resolution error.

## Code conventions

### Naming

camelCase files throughout, including components (`RoomScreen.tsx`). Components are named
function exports with an explicit props interface, never default exports; the single
default export in the repo is the Worker itself. Module constants are SCREAMING_SNAKE_CASE
and live next to the concept they belong to (`NAME_MAX_LENGTH` in `name.ts`). Private class
members use `#` fields. There are no barrel `index.ts` files; import the concrete module.

Spelling things out is a real preference: `roomId`, `participantId`, `translate`. Storage
keys are namespaced with `hanko:` (`hanko:locale`, `hanko:token:<roomId>`, `hanko:name:<roomId>`).

### Errors are return values, not exceptions

Domain transitions never throw. "Nothing changed" is signalled by returning the **same
reference**, which the tests assert directly:

```ts
export function joinRoom(room, participant): RoomSnapshot {
  if (room.participants.length >= MAX_PARTICIPANTS) {
    return room;
  }
  ...
}
```

Validation returns a discriminated union, plus a thin boolean wrapper for callers that
only need the yes or no:

```ts
export type NameValidationResult =
  | { valid: true; name: string }
  | { valid: false; reason: "empty" | "too_long" | "invalid_characters" };

export function validateName(rawName: string): NameValidationResult { ... }
export function isValidName(rawName: string): boolean { return validateName(rawName).valid; }
```

The one sanctioned exception is a typed error class carrying a reason union, used at
network boundaries — `CreateRoomError` in `application/createRoom.ts`. Callers narrow on
it and rethrow anything they do not recognise.

Server side, failures leave as protocol error frames rather than HTTP errors:
`this.#fail(socket, ERROR_CODES.notOwner); return;`.

### Dependency injection without a container

Inject via a defaulted parameter. No container, no interface-for-everything:

```ts
export async function createRoom(fetchImpl: typeof fetch = globalThis.fetch): Promise<string>
constructor(private readonly roomId: string,
            private readonly socketFactory: SocketFactory = createDefaultSocketFactory()) {}
```

### Comments explain why, in prose

This is the strongest convention in the repo. Comments are complete sentences that explain
the reasoning and often the rejected alternative. There are no `// TODO`, no comments that
restate the code, and no commented-out blocks.

```ts
/**
 * Removal has to hold, otherwise the person just reloads with the token still in
 * sessionStorage and walks straight back in. The tombstone is capped because the
 * room only needs to outlive a reconnect, not remember people forever.
 */
```

```ts
/**
 * The room id is the only secret guarding a room, so the alphabet is large and the
 * draw has to be uniform. A plain `byte % 30` biases the first characters of the
 * alphabet, so values that do not divide evenly are rejected and redrawn instead.
 */
```

If you change a rule that has such a comment, update the comment with it. Match the
register: explain the trade-off, not the mechanism.

### TypeScript

Both configs enable `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
`isolatedModules` and `noUnusedLocals`/`noUnusedParameters`. `verbatimModuleSyntax` is
why type imports are written as `import type`.

`noUncheckedIndexedAccess` means `array[0]` is `T | undefined`. This is not something to
work around with `!`; the tests handle it with `participants[0]?.vote`.

Zero `any` in the repository, and zero `eslint-disable` or `@ts-ignore`. For platform
fakes in tests use `as never` (the fake `DurableObjectState`) or
`as unknown as WebSocket`.

`no-console` is a warning outside `src/infra` and is fully disabled inside it. The
pre-commit hook runs with `--max-warnings=0`, so a stray `console.log` will fail the
commit. Use `console.warn` / `console.error` where logging is genuinely needed.

### Styling and accessibility

Tailwind utilities inline, plus a BEM-ish `src/presentation/styles/theme.css` for
animation and stateful pieces. Design tokens are CSS variables surfaced through `@theme`
(`bg-paper`, `text-ink-dim`, `border-line`, `text-primary`, `font-display`,
`rounded-chip`). Arbitrary values are normal here: `min-h-11`, `max-w-115`,
`text-[clamp(15px,4.2vw,22px)]`.

Accessibility is treated as a requirement, not polish. Every icon gets `aria-hidden`,
every icon only button gets an `aria-label`, errors use `role="alert"`, chat uses
`role="log"`, the vote meter is a `role="progressbar"` with `aria-valuenow`, toggles carry
`aria-pressed`, and screen reader only text uses the `visually-hidden` utility. Motion is
gated on `prefers-reduced-motion`, which `Shell.tsx` reflects onto
`data-reduced-motion`.

Fonts are self hosted with hand written `@font-face` blocks declaring only the `latin` and
`latin-ext` subsets; the Vietnamese subset is deliberately skipped and the reason is in a
comment.

## Testing

Tests are co-located next to the source they cover: `foo.ts` gets `foo.test.ts`, and
`foo.tsx` gets `foo.test.tsx`. The environment is jsdom for everything, including the
Worker and Durable Object tests, which run against hand rolled fakes rather than
workerd. A few files are named after a concern instead of a module
(`infra/security.test.ts`, `infra/stateEndpoint.test.ts`); that is fine when a test spans
more than one file, but prefer one test file per source file otherwise.

Coverage is gated at 80% for statements, branches, functions and lines, and the gate
covers every layer: `src/domain`, `src/application`, `src/infra` and `src/presentation`.
A layer left out of the gate is a layer where a regression is free, so adding a new one
to the thresholds is part of adding the layer itself.

The thresholds are on the total, not per file, so one well covered file can carry another.
When you add a component, check its own numbers rather than assuming the aggregate speaks
for it.

Test names are behavioural sentences in the present tense: `"refuses a full room"`,
`"keeps the seat of someone who just left"`, `"does not hand a connected socket vote to an
anonymous caller"`.

There is no shared test helper module and no mocking library. Each test file declares its
own local factories, which is deliberate:

- `function state(overrides): PublicRoomState` in every presentation test
- `function createFakeSocket()` in infra tests
- `function createFakeStorage(initial)` — an in-memory `DurableObjectState` with
  `getWebSockets`, `acceptWebSocket`, `storage.get/put/delete`, `setAlarm`
- `function renderRoom()` style helpers returning `{ handlers }`

Module level mocks use `vi.hoisted` plus `vi.mock`, e.g. a fake `RoomConnection` class in
`RoomScreen.test.tsx`. Globals are stubbed with `vi.stubGlobal` and cleaned up in
`afterEach` with `vi.unstubAllGlobals()`. Animation tests use `vi.useFakeTimers()` with
`act(() => vi.advanceTimersByTime(ms))`.

Assert on rendered output with `toBe`, `toBeTruthy`, `toHaveLength` and
`container.querySelector`. `toBeInTheDocument` is not the house style even though jest-dom
is set up. `data-*` attributes such as `[data-phase]`, `[data-open]`, `[data-consensus]`,
`[data-copied]`, `[data-role]` are part of the test contract: when you add state a test
needs to see, add the attribute too.

Regressions get a comment naming the original bug, so the reader knows what the test is
protecting.

## Internationalisation

`locales/en-US/translations.json` and `locales/pt-BR/translations.json`, addressed by dot
path, resolved by `application/i18n.ts`. `translate` is passed down as a prop from
`Root.tsx`; never import a dictionary inside a component.

Adding a key means adding it to **both** files with matching `{{variable}}` names.
`i18n.test.ts` enforces key parity and placeholder hygiene, so a half finished translation
fails the suite. Missing keys return the path itself rather than throwing. Keys are
namespaced (`join`, `welcome`, `room`, `controls`, `vote`, `errors`, `a11y`, `landing`,
`brand`, `result`, `progress`, `consensus`, `chat`, `session`) and error codes map onto
`errors.<code>` dynamically.

The selected locale persists under `localStorage["hanko:locale"]`. Storage access is
wrapped in `try/catch` because it can be denied by the browser.

## Security notes

The threat model is the weak one and the code takes it seriously: no accounts, room id is
the only secret, so guessing or leaking an id is the attack. When touching this code, keep
these properties intact:

- Room ids use a Crockford style alphabet excluding ambiguous characters, drawn with
  rejection sampling so the distribution is uniform.
- Votes are hidden server side until reveal, and a vote is only ever returned for a token
  the caller actually presents. A regression test guards this; do not relax it to make a
  state fixture easier to build.
- WebSocket upgrades validate `Origin`, refusing a missing `Origin` as a non browser
  client to block cross site WebSocket hijacking.
- Chat and commands have separate per window rate limits, and `MAX_SOCKETS` caps sockets
  per room.
- `public/_headers` carries the CSP and the other response headers. It is plain text and
  nothing typechecks or tests it, so if you edit it, read it back. An unterminated `/*`
  comment silently turns the whole file into a comment and disables every header in
  production.

## Commits

Write the history the way the existing commits read. A capitalised sentence in the
imperative as the subject, then a prose body wrapped at about 75 columns that explains
**why** the change was made, not a list of what changed. Reach for a bullet list only
when the thing being enumerated is a list, such as a security audit.

There are no `feat:`, `fix:` or `chore:` prefixes anywhere in this repository, and adding
one would not match a single existing commit.

An agent never signs its own work. Do not add a `Co-Authored-By` trailer, a `Generated
with` line, or any other trailer naming a model or a tool. The person who asked for the
change is its author, and an attribution trailer is noise that follows every future
`git blame` for no benefit to the reader.

Never commit unless you were asked to in this conversation, and never push unless you
were asked to as well. Those are two separate permissions and one does not imply the
other. Leave the working tree as you found it and say plainly what you changed.

Do not reach for `--no-verify` to get past a failing hook. The pre-commit gate is the
reason this repository can quote its coverage and lint numbers at all, so a commit that
skipped it is a hole in that claim. Fix the underlying failure instead.

## Deploying

`npm run deploy` runs the coverage gate, then `build`, then `wrangler deploy`, so a
Durable Object bundle is never replaced by a commit whose tests never ran. A `pre-push`
hook additionally runs lint, both typecheck passes, coverage and the production build
across the whole tree, which catches what the staged-file pre-commit hook cannot.

Changes to the `Room` Durable Object's storage shape need a migration entry in
`wrangler.jsonc`; the existing one is tagged `v1`.