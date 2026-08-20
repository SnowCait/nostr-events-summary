# Nostr events summary

Crawls Nostr relays for kind-1984 (NIP-56 report) events, counts how many
distinct reports reference each pubkey, and publishes a ranked list of the most
reported pubkeys.

## What it does

Nostr's NIP-56 defines a *report* event (kind 1984): users flag other users
via `p` tags (and notes or communities via `e`/`t` tags) for spam,
impersonation, illegal content, and similar reasons. This project continuously
collects kind-1984 events from a set of relays and maintains a public,
machine-readable ranking of the pubkeys that have received the most reports.

The primary output is a ranked list of pubkeys, each referenced by **more than
`threshold` (56) distinct report events**. A GitHub Actions workflow refreshes
the ranking every hour.

## How it works

`main.ts` is a single Deno/TypeScript program:

1. Loads the relay list from `relays.json` and connects via the
   [`nostr-fetch`](https://www.npmjs.com/package/nostr-fetch) library.
2. Reads persisted state: the previous run's timestamp cursor from
   `docs/1984.meta.json` and the event sets from `docs/1984.data.json`.
3. Fetches all kind-1984 events published **after** the stored cursor (or, on
   the first run with no cursor yet, after the last 7 days).
4. For each event, extracts every `p` tag — the pubkeys the report is about —
   and records the event ID under that pubkey. Event IDs are stored in sets,
   so the same event is never double-counted across runs.
5. Builds the summary: pubkeys whose distinct-report count is greater than the
   `threshold` constant, sorted by count in descending order.
6. Writes three files back to `docs/` (see [Output files](#output-files)).

Per-event pubkeys and the final summary are printed to stdout, which is useful
for inspecting a run's logs in CI.

## Prerequisites

- [Deno](https://deno.land/) 1.38 or newer — the code relies on ES2023 array
  methods (`toSorted`) and `with` JSON import attributes, and CI always
  installs the latest Deno via `denoland/setup-deno@v1`.
- No other dependencies: `nostr-fetch` is fetched at runtime by Deno from npm.

## Setup

```sh
git clone https://github.com/SnowCait/nostr-events-summary.git
cd nostr-events-summary
deno task run
```

The first run has no cursor, so it fetches the last 7 days of kind-1984 events
from all configured relays. Subsequent runs fetch only events newer than the
stored cursor.

## Configuration

**Relays** — edit `relays.json` to add or remove relays. It is a JSON array of
`wss://` URLs:

```json
[
  "wss://nostr.wine",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.wirednet.jp",
  "wss://yabu.me"
]
```

**Threshold** — the `threshold = 56` constant in `main.ts` is the cutoff for
the summary: only pubkeys referenced by more than 56 distinct report events
are listed. Raise it for a shorter, stricter list; lower it for a longer one.

## Usage

`deno.json` defines two tasks, both running `main.ts` with network, read, and
write permissions:

| Task   | Command                                                            | Use                                   |
| ------ | ------------------------------------------------------------------ | ------------------------------------- |
| `run`  | `deno run --allow-net --allow-read --allow-write main.ts`          | One-shot run                          |
| `dev`  | the same with `--watch`                                            | Watch mode for development            |

```sh
deno task run   # fetch new reports and update docs/
deno task dev   # run and reload on file changes
```

## Automation

`.github/workflows/run.yml` runs the program on a schedule and commits the
results back to the repository:

- **Triggers:** every push, hourly (`0 * * * *`), and manual
  `workflow_dispatch`.
- **Steps:** checks out the repo, configures git identity, installs Deno, runs
  `deno task run`, then checks whether `docs/1984.data.json` changed.
- **Commit:** only when new report events actually arrived — i.e. when
  `1984.data.json` differs from the committed version — the workflow stages
  the whole `docs/` directory, commits it with the message `Update`, and
  pushes. (`1984.meta.json` is rewritten with a fresh timestamp on every run,
  so `1984.data.json` is the meaningful "did anything change" signal.)

The job runs on `ubuntu-latest` with a 10-minute timeout; if a fetch exceeds
that, the job fails without committing, and the next scheduled run picks up
from the last committed cursor.

## Output files

All output lives in `docs/`:

| File                  | Content                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `docs/1984.json`      | Ranked list of pubkeys (hex), most-reported first, filtered to those with more than `threshold` distinct reports. The primary deliverable. |
| `docs/1984.data.json` | Incremental state: a map of pubkey → array of report event IDs seen for that pubkey. Grows over time and is the source of the counts. |
| `docs/1984.meta.json` | Cursor: `{"until": <unix timestamp>}` — the time of the last run, used as the lower bound (`since`) for the next fetch. |

## License

MIT. Copyright (c) 2024 雪猫 (SnowCait).
