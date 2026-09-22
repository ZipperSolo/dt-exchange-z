import { expect, test } from "vitest"
import { filterFunc } from "./filter"
import type { Character, Items, Personal } from "./types"

const char: Character = {
	id: "c1",
	name: "Test",
	gender: "female",
	archetype: "veteran",
	specialization: "",
	level: 30,
}

function makeOffer(overrides: Partial<Personal["description"]["overrides"]> = {}): Personal {
	return {
		offerId: "o1",
		sku: {} as any,
		entitlement: {} as any,
		price: { amount: { amount: 100, type: "credits" }, id: "p1", priority: 0, priceFormula: "" },
		state: "active",
		description: {
			id: "item1",
			gearId: "",
			rotation: "",
			type: "weapons",
			properties: {},
			overrides: {
				ver: 1,
				rarity: 3,
				characterLevel: 1,
				itemLevel: 500,
				baseItemLevel: 380,
				traits: [],
				perks: [],
				...overrides,
			},
		},
		media: [],
	}
}

test("minStats matches when baseItemLevel >= min", () => {
	expect(filterFunc(char, "credits", makeOffer(), [{ minStats: 360 }], {} as Items)).toBe(0)
	expect(filterFunc(char, "credits", makeOffer(), [{ minStats: 381 }], {} as Items)).toBe(-1)
})

test("store filter matches only the right store", () => {
	expect(filterFunc(char, "credits", makeOffer(), [{ store: "credits" }], {} as Items)).toBe(0)
	expect(filterFunc(char, "marks", makeOffer(), [{ store: "credits" }], {} as Items)).toBe(-1)
})

test("returns -1 without a character", () => {
	expect(filterFunc(undefined, "credits", makeOffer(), [{ minStats: 360 }], {} as Items)).toBe(-1)
})
