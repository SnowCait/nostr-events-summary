import { NostrFetcher } from "npm:nostr-fetch";
import relays from "./relays.json" with { type: "json" };

const threshold = 56;
const now = Math.floor(Date.now() / 1000);

const metaPath = "docs/1984.meta.json";
const dataPath = "docs/1984.data.json";
const summaryPath = "docs/1984.json";
const metaJson = await Deno.readTextFile(metaPath);
const dataJson = await Deno.readTextFile(dataPath);
const { until: since } = JSON.parse(metaJson) as { until?: number };
const lastData = JSON.parse(dataJson) as { [key: string]: string[] };

const fetcher = NostrFetcher.init();

const iter = fetcher.allEventsIterator(relays, { kinds: [1984] }, {
    since: since ?? (now - 7 * 24 * 60 * 60),
});

const data = new Map<string, Set<string>>(
    lastData === undefined ? undefined : Object.entries(lastData).map((
        [pubkey, ids],
    ) => [pubkey, new Set(ids)]),
);

for await (const event of iter) {
    const pubkeys = event.tags.filter(([t, pubkey]) =>
        t === "p" && typeof pubkey === "string"
    ).map(([, pubkey]) => pubkey);
    console.log(pubkeys);
    for (const pubkey of pubkeys) {
        const list = data.get(pubkey);
        if (list === undefined) {
            data.set(pubkey, new Set([event.id]));
        } else {
            list.add(event.id);
            data.set(pubkey, list);
        }
    }
}

const summary = [...data].map(([pubkey, ids]) => ({ pubkey, count: ids.size }))
    .filter(({ count }) => count > threshold)
    .toSorted(({ count: x }, { count: y }) => y - x).map(({ pubkey }) =>
        pubkey
    );
console.log(summary);
await Deno.writeTextFile(
    dataPath,
    JSON.stringify(
        Object.fromEntries(
            [...data].map(([pubkey, ids]) => [pubkey, [...ids]]),
        ),
        null,
        2,
    ),
);
await Deno.writeTextFile(metaPath, JSON.stringify({ until: now }, null, 2));
await Deno.writeTextFile(summaryPath, JSON.stringify(summary, null, 2));

fetcher.shutdown();
