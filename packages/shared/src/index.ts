// ─── User / Household ───

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  householdSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  dietaryRestrictions: string[];
  dislikedFoods: string[];
  favoriteCuisines: string[];
  groceryBudget: number | null;
  cookingTimePreference: 'quick' | 'moderate' | 'any' | null;
  kidFriendly: boolean;
  leftoverPreference: 'yes' | 'no' | 'sometimes' | null;
  updatedAt: string;
}

// ─── Meal Plan ───

export interface MealPlan {
  id: string;
  userId: string;
  weekStart: string;
  title: string | null;
  status: 'draft' | 'active' | 'archived';
  meals: MealPlanMeal[];
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanMeal {
  id: string;
  mealPlanId: string;
  dayOfWeek: number; // 0=Sunday … 6=Saturday
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  description: string | null;
  recipe: Recipe | null;
  sortOrder: number;
}

// ─── Recipe ───

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  instructions: string[];
  ingredients: RecipeIngredient[];
}

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  category: IngredientCategory;
}

export type IngredientCategory =
  | 'produce'
  | 'meat'
  | 'seafood'
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'beverages'
  | 'spices'
  | 'other';

// ─── Grocery ───

export interface GroceryList {
  id: string;
  mealPlanId: string;
  items: GroceryItem[];
  createdAt: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  inPantry: boolean;
  matchedProduct: MatchedProduct | null;
}

export interface MatchedProduct {
  productId: string;
  skuId: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  unitPrice: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
  category: string | null;
  status: 'matched' | 'confirmed' | 'rejected' | 'in_cart';
}

// ─── H-E-B ───

export interface HebSessionStatus {
  connected: boolean;
  store: { storeId: string; name: string } | null;
  lastUpdated: string | null;
}

export interface HebProduct {
  productId: string;
  skuId: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  unitPrice: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
  category: string | null;
}

export interface HebCart {
  id: string;
  items: HebCartItem[];
  estimatedTotal: number | null;
  itemCount: number;
  store: { storeId: string; name: string; address: string; city: string; state: string; zip: string } | null;
}

export interface HebCartItem {
  productId: string;
  skuId: string;
  name: string;
  quantity: number;
  price: number | null;
  imageUrl: string | null;
}

// ─── API Request / Response ───

export interface CreateMealPlanRequest {
  message: string;
  weekStart?: string;
}

export interface CreateMealPlanResponse {
  mealPlan: MealPlan;
}

export interface ReplaceMealRequest {
  message?: string;
}

export interface ReplaceMealResponse {
  meal: MealPlanMeal;
}

export interface GroceryListResponse {
  groceryList: GroceryList;
}

export interface MatchProductsResponse {
  groceryList: GroceryList;
}

export interface ProfileResponse {
  profile: UserProfile;
}

export interface PreferencesResponse {
  preferences: UserPreferences;
}

export interface UpdatePreferencesRequest {
  dietaryRestrictions?: string[];
  dislikedFoods?: string[];
  favoriteCuisines?: string[];
  groceryBudget?: number | null;
  cookingTimePreference?: 'quick' | 'moderate' | 'any' | null;
  kidFriendly?: boolean;
  leftoverPreference?: 'yes' | 'no' | 'sometimes' | null;
  householdSize?: number | null;
}

// ─── API Error ───

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Health ───

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}
