import type { Character, FilterRule, Items, Personal, StoreType } from "./types"
import localisation from "./localisation"
import { getBlessingDescription, getPerkDescription } from "./components/Item/utils"

// Returns the index of the first matching rule, or -1. Pure — does not mutate the offer.
export function filterFunc(
	char: Character | undefined,
	storeType: StoreType,
	offer: Personal,
	targets: FilterRule[],
	items: Items,
): number {
	if (!char) {
		return -1
	}

	let arr: string[]

	return targets.findIndex(function (target) {
		arr = typeof target.character === "string" ? [target.character] : target.character
		if (target.character && !arr.includes(char.archetype)) {
			return false
		}

		if (target.store && !target.store.includes(storeType)) {
			return false
		}

		if (target.item) {
			arr = typeof target.item === "string" ? [target.item] : target.item
			if (
				!arr.find((element) =>
					localisation[offer.description.id].display_name.match(new RegExp(element, "i")),
				)
			) {
				return false
			}
		}

		if (target.type) {
			arr = typeof target.type === "string" ? [target.type] : target.type
			if (
				!arr.find(function (element) {
					switch (items[offer.description.id]?.item_type) {
						case "WEAPON_RANGED":
							return target.type.toLowerCase() == "ranged" ? true : false
						case "WEAPON_MELEE":
							return target.type.toLowerCase() == "melee" ? true : false
						case "GADGET":
							return target.type.toLowerCase() == "curio" ? true : false
						default:
							return false
					}
				})
			) {
				return false
			}
		}

		if (target.minStats && target.minStats > offer.description.overrides.baseItemLevel) {
			return false
		}

		if (target.minRating && target.minRating > offer.description.overrides.itemLevel) {
			return false
		}

		if (target.blessing) {
			arr = typeof target.blessing === "string" ? [target.blessing] : target.blessing
			if (
				!offer.description.overrides.traits.find(function (blessing) {
					if (
						!arr.find((element) => {
							const nameMatch = localisation[blessing.id].display_name
								.toLowerCase()
								.includes(element.toLowerCase())
							const descMatch = getBlessingDescription(blessing, offer, items)
								.toLowerCase()
								.includes(element.toLowerCase())
							return nameMatch || descMatch
						})
					) {
						return false
					}
					return true
				})
			) {
				return false
			}
		}

		if (target.minBlessingRarity) {
			if (
				!offer.description.overrides.traits.find(function (blessing) {
					if (blessing.rarity >= target.minBlessingRarity) {
						return true
					}
					return false
				})
			) {
				return false
			}
		}

		if (target.perk) {
			arr = typeof target.perk === "string" ? [target.perk] : target.perk
			if (
				!offer.description.overrides.perks.find(function (perk) {
					if (
						!arr.find((element) =>
							getPerkDescription(perk, items).toLowerCase().includes(element.toLowerCase()),
						)
					) {
						return false
					}
					return true
				})
			) {
				return false
			}
		}

		if (target.minPerkRarity) {
			if (
				!offer.description.overrides.perks.find(function (perk) {
					if (perk.rarity >= target.minPerkRarity) {
						return true
					}
					return false
				})
			) {
				return false
			}
		}

		if (target.stats) {
			const statsPass: boolean = target.stats.every((statRule) => {
				const offerStatFound = offer.description.overrides.base_stats?.find(
					(baseStat) =>
						localisation[baseStat.name].display_name.toLowerCase() ===
							statRule.name.toLowerCase() && baseStat.value * 100 >= statRule.min,
				)
				return !!offerStatFound
			})
			if (!statsPass) return false
		}

		return true
	})
}
