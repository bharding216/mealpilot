interface RawIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  category: string;
}

interface ConsolidatedIngredient {
  name: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  sources: string[];
}

const UNIT_ALIASES: Record<string, string> = {
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  bunch: 'bunch',
  bunches: 'bunch',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  jar: 'jar',
  jars: 'jar',
  head: 'head',
  heads: 'head',
  piece: 'piece',
  pieces: 'piece',
  slice: 'slice',
  slices: 'slice',
};

const CATEGORY_SORT: Record<string, number> = {
  produce: 0,
  meat: 1,
  seafood: 2,
  dairy: 3,
  bakery: 4,
  pantry: 5,
  frozen: 6,
  beverages: 7,
  spices: 8,
  other: 9,
};

/** Normalize an ingredient name for deduplication */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,\.]+$/, '')
    // Remove common qualifiers that don't affect the base ingredient
    .replace(/\b(fresh|dried|ground|minced|chopped|sliced|diced|shredded|grated|large|medium|small|boneless|skinless)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a unit string */
function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  return UNIT_ALIASES[lower] ?? lower;
}

/** Check if two units are compatible for addition */
function unitsCompatible(a: string | null, b: string | null): boolean {
  const normA = normalizeUnit(a);
  const normB = normalizeUnit(b);
  if (normA === normB) return true;
  if (!normA || !normB) return false;
  return false;
}

/**
 * Consolidate ingredients from multiple recipes into a single grocery list.
 * Combines duplicate ingredients by adding quantities where units match.
 */
export function consolidateIngredients(
  recipes: { title: string; ingredients: RawIngredient[] }[]
): ConsolidatedIngredient[] {
  const map = new Map<string, ConsolidatedIngredient>();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = normalizeIngredientName(ing.name);

      const existing = map.get(key);
      if (existing && unitsCompatible(existing.unit, ing.unit)) {
        // Merge quantities
        if (existing.quantity != null && ing.quantity != null) {
          existing.quantity += ing.quantity;
        } else if (ing.quantity != null) {
          existing.quantity = ing.quantity;
        }
        if (!existing.sources.includes(recipe.title)) {
          existing.sources.push(recipe.title);
        }
      } else if (!existing) {
        map.set(key, {
          name: key,
          displayName: ing.name.trim(),
          quantity: ing.quantity,
          unit: normalizeUnit(ing.unit),
          category: ing.category || 'other',
          sources: [recipe.title],
        });
      } else {
        // Different units — add as separate entry with a distinguishing key
        const altKey = `${key}__${normalizeUnit(ing.unit) ?? 'nounit'}`;
        const existingAlt = map.get(altKey);
        if (existingAlt) {
          if (existingAlt.quantity != null && ing.quantity != null) {
            existingAlt.quantity += ing.quantity;
          }
          if (!existingAlt.sources.includes(recipe.title)) {
            existingAlt.sources.push(recipe.title);
          }
        } else {
          map.set(altKey, {
            name: key,
            displayName: ing.name.trim(),
            quantity: ing.quantity,
            unit: normalizeUnit(ing.unit),
            category: ing.category || 'other',
            sources: [recipe.title],
          });
        }
      }
    }
  }

  // Sort: by category, then alphabetically within each category
  const result = Array.from(map.values());
  result.sort((a, b) => {
    const catDiff = (CATEGORY_SORT[a.category] ?? 9) - (CATEGORY_SORT[b.category] ?? 9);
    if (catDiff !== 0) return catDiff;
    return a.displayName.localeCompare(b.displayName);
  });

  return result;
}

/**
 * Filter out items the user already has in their pantry.
 */
export function filterPantryItems(
  items: ConsolidatedIngredient[],
  pantryItems: string[]
): { needed: ConsolidatedIngredient[]; inPantry: ConsolidatedIngredient[] } {
  const pantrySet = new Set(pantryItems.map(normalizeIngredientName));

  const needed: ConsolidatedIngredient[] = [];
  const inPantry: ConsolidatedIngredient[] = [];

  for (const item of items) {
    if (pantrySet.has(item.name)) {
      inPantry.push(item);
    } else {
      needed.push(item);
    }
  }

  return { needed, inPantry };
}

/** Format a quantity + unit for display */
export function formatQuantityDisplay(quantity: number | null, unit: string | null): string {
  if (quantity == null) return '';
  const q = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${q} ${unit}` : q;
}
