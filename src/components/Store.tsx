import { Loading } from "./Loading"
import { Text } from "./Text"
import type { Items, Personal, StoreType, FilterRule, Character } from "../types"
import { useMasterList } from "../hooks/useMasterList"
import { useStore } from "../hooks/useStore"
import localisation from "../localisation"
import "./Store.css"
import { Countdown } from "./Countdown"
import { Item } from "./Item/Item"
import type { DeemphasizeOption } from "./Item/Item"
import { filterFunc } from "../filter"

const sortOptions = {
	modifiersRating: (a: Personal, b: Personal) => {
		let aRating =
			a.description.overrides.base_stats?.reduce((sum, stat) => {
				return Math.round(sum + stat.value * 100)
			}, 0) || a.description.overrides.itemLevel
		let bRating =
			b.description.overrides.base_stats?.reduce((sum, stat) => {
				return Math.round(sum + stat.value * 100)
			}, 0) || b.description.overrides.itemLevel
		return bRating - aRating
	},

	itemRating: (a: Personal, b: Personal) => {
		return b.description.overrides.itemLevel - a.description.overrides.itemLevel
	},

	rarity: (a: Personal, b: Personal) => {
		if (b.description.overrides.rarity === a.description.overrides.rarity) {
			return b.description.overrides.itemLevel - a.description.overrides.itemLevel
		}
		return b.description.overrides.rarity - a.description.overrides.rarity
	},

	alphabetical: (a: Personal, b: Personal) => {
		let aName = localisation[a.description.id].display_name
		let bName = localisation[b.description.id].display_name
		return aName > bName ? 1 : -1
	},

	credits: (a: Personal, b: Personal) => {
		return b.price.amount.amount - a.price.amount.amount
	},
} as const

export type SortOption = keyof typeof sortOptions
export const SORT_OPTIONS = Object.keys(sortOptions) as SortOption[]

let filterOptions = {
	none: () => () => true,

	ranged: (items: Items) => (item: Personal) => {
		return items[item.description.id]?.item_type === "WEAPON_RANGED"
	},

	melee: (items: Items) => (item: Personal) => {
		return items[item.description.id]?.item_type === "WEAPON_MELEE"
	},

	curio: (items: Items) => (item: Personal) => {
		return items[item.description.id]?.item_type === "GADGET"
	},
}

export type FilterOption = keyof typeof filterOptions
export const FILTER_OPTIONS = Object.keys(filterOptions) as FilterOption[]

export function Store({
	character,
	storeType,
	sortOption,
	filterOption,
	enableRuleBasedFilterOption,
	filterRules,
	deemphasizeOption,
}: {
	character: Character
	storeType: StoreType
	sortOption: SortOption
	filterOption: FilterOption
	enableRuleBasedFilterOption: boolean
	filterRules: FilterRule[]
	deemphasizeOption: DeemphasizeOption
}) {
	let store = useStore(character, storeType)
	let items = useMasterList()
	var targets: FilterRule[]

	if (!store) {
		return <Loading />
	}

	if (!items) {
		return <Loading />
	}

	if (enableRuleBasedFilterOption) {
		try {
			targets = filterRules
			if (targets.length > 0) {
				store.personal.map(function (offer) {
					offer.description.overrides.filter_match = filterFunc(
						character,
						storeType,
						offer,
						targets,
						items!,
					)
				})
			}
		} catch (e) {
			console.log("Failed to parse filter rules", e)
		}
	} else {
		deemphasizeOption = "none"
	}

	return (
		<>
			<Text>
				Refresh in{" "}
				<Countdown key={store.currentRotationEnd} until={parseInt(store.currentRotationEnd, 10)} />
			</Text>
			{store.personal
				.filter(filterOptions[filterOption](items))
				.sort(sortOptions[sortOption])
				.map((offer) => {
					return (
						<Item
							key={offer.offerId}
							offer={offer}
							character={character}
							rbfEnabled={enableRuleBasedFilterOption}
							deemphasizeOption={deemphasizeOption}
							items={items!}
							targets={targets}
						/>
					)
				})}
		</>
	)
}
