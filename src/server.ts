import fs from "node:fs"
import { createFetcher } from "./utils"
import { filterFunc } from "./filter"
import localisation from "./localisation"
import { getBlessingDescription, getPerkDescription } from "./components/Item/utils"
import type {
	Character,
	FilterRule,
	Items,
	MasterData,
	Personal,
	Store,
	StoreType,
	Summary,
	User,
} from "./types"

type Fetcher = (path: string) => Promise<any>

type Config = {
	user: User
	rules: FilterRule[]
	discordWebhook: string
	pollIntervalMs?: number
	storeTypes?: StoreType[]
	stateFile?: string
	dryRun?: boolean
}

function loadConfig(): { config: Config; path: string } {
	const path = process.env["CONFIG_FILE"] ?? "server.config.json"
	let config: Config
	try {
		config = JSON.parse(fs.readFileSync(path, "utf8"))
	} catch {
		throw new Error(
			`missing or invalid ${path} — copy server.config.example.json and fill in "user" and "discordWebhook"`,
		)
	}
	if (!config.user?.AccessToken || !config.discordWebhook) {
		throw new Error(`${path} must include "user.AccessToken" and "discordWebhook"`)
	}
	return { config, path }
}

function loadSeen(path: string): Set<string> {
	try {
		return new Set<string>(JSON.parse(fs.readFileSync(path, "utf8")))
	} catch {
		return new Set()
	}
}

function saveSeen(path: string, seen: Set<string>) {
	fs.writeFileSync(path, JSON.stringify([...seen], null, 2))
}

// Mirrors the accounts site: GET queue/refresh with the refresh token as a Bearer token.
async function refreshUser(user: User) {
	const res = await fetch("https://login.shr-prod-identity.fatshark.services/queue/refresh", {
		headers: { authorization: `Bearer ${user.RefreshToken}` },
	})
	if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`)
	const data = (await res.json()) as Partial<User>
	if (!data.AccessToken) throw new Error("token refresh returned no AccessToken")
	user.AccessToken = data.AccessToken
	user.RefreshToken = data.RefreshToken ?? user.RefreshToken
	user.ExpiresIn = data.ExpiresIn ?? 1800
	user.Sub = data.Sub ?? user.Sub
	user.AccountName = data.AccountName ?? user.AccountName
	user.RefreshAt = Date.now() + (user.ExpiresIn - 300) * 1000
}

async function getItems(fetcher: Fetcher): Promise<Items> {
	const meta = (await fetcher("/master-data/meta/items")) as MasterData
	return (await fetcher(meta.playerItems.href)) as Items
}

function displayName(id: string, items: Items): string {
	return items[id]?.display_name ?? localisation[id].display_name
}

function offerTitle(offer: Personal, items: Items): string {
	const overrides = offer.description.overrides
	return offer.description.type === "gadget" && overrides.traits.length
		? getBlessingDescription(overrides.traits[0], offer, items)
		: displayName(offer.description.id, items)
}

function describeOffer(offer: Personal, items: Items): string {
	const overrides = offer.description.overrides
	const isCurio = offer.description.type === "gadget"
	const name = offerTitle(offer, items)

	const stats = (overrides.base_stats ?? [])
		.map((s) => `${localisation[s.name].display_name} ${(s.value * 100).toFixed(0)}%`)
		.join(", ")

	const perks = overrides.perks.map((p) => getPerkDescription(p, items)).join(", ")

	const blessings = isCurio
		? null
		: overrides.traits
				.map((t) => `${localisation[t.id].display_name} (rarity ${t.rarity})`)
				.join(", ")

	return [
		`**${name}**`,
		`Rating ${overrides.itemLevel} • ${offer.price.amount.amount} ${offer.price.amount.type}`,
		stats ? `Stats: ${stats}` : null,
		perks ? `Perks: ${perks}` : null,
		blessings ? `Blessings: ${blessings}` : null,
	]
		.filter(Boolean)
		.join("\n")
}

async function notify(
	webhook: string,
	char: Character,
	storeType: StoreType,
	offer: Personal,
	items: Items,
	rule: FilterRule,
) {
	const content = [
		`${describeOffer(offer, items)}`,
		`Character: ${char.name} (${char.archetype}) — ${storeType}`,
		`Rule: \`${JSON.stringify(rule)}\``,
	].join("\n")

	await fetch(webhook, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ content }),
	})
}

async function main() {
	const { config, path } = loadConfig()
	const dryRun = config.dryRun || process.env["DRY_RUN"] === "1"
	const fetcher = createFetcher(config.user)
	const storeTypes = config.storeTypes ?? ["credits", "marks"]
	const stateFile = config.stateFile ?? "seen.json"
	let seen = loadSeen(stateFile)
	let items: Items | undefined

	async function ensureFresh() {
		if (Date.now() < config.user.RefreshAt) return
		console.log("refreshing token...")
		await refreshUser(config.user)
		fs.writeFileSync(path, JSON.stringify(config, null, "\t") + "\n")
		console.log(`token refreshed (valid for ${config.user.ExpiresIn}s)`)
	}

	async function poll() {
		try {
			await ensureFresh()
			items ??= await getItems(fetcher)

			const summary = (await fetcher("/web/:sub/summary")) as Summary
			if (!summary?.characters) throw new Error("no characters in summary")

			const current = new Set<string>()

			for (const char of summary.characters) {
				for (const storeType of storeTypes) {
					const store = (await fetcher(
						`/store/storefront/${storeType}_store_${char.archetype}?accountId=:sub&personal=true&characterId=${char.id}`,
					)) as Store
					if (!store?.personal) continue

					for (const offer of store.personal) {
						if (offer.state === "completed") continue
						current.add(offer.offerId)

						const ruleIndex = filterFunc(char, storeType, offer, config.rules, items)
						if (ruleIndex >= 0) {
							const name = offerTitle(offer, items)
							if (dryRun) {
								console.log(`dry-run match: ${name} (${char.name}, ${storeType})`)
							} else if (!seen.has(offer.offerId)) {
								seen.add(offer.offerId)
								console.log(`match: ${name} (${char.name}, ${storeType})`)
								await notify(
									config.discordWebhook,
									char,
									storeType,
									offer,
									items,
									config.rules[ruleIndex]!,
								)
							}
						}
					}
				}
			}

			for (const id of seen) {
				if (!current.has(id)) seen.delete(id)
			}
			saveSeen(stateFile, seen)
		} catch (error) {
			console.error("poll failed:", error)
		}
	}

	await poll()
	setInterval(poll, config.pollIntervalMs ?? 60_000)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
