import { getOpenAI } from './openai.js';

interface MealSuggestion {
  dayOfWeek: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  instructions: string[];
  ingredients: {
    name: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    category: string;
  }[];
}

interface MealPlanSuggestion {
  title: string;
  meals: MealSuggestion[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function generateMealPlan(
  userMessage: string,
  preferences?: {
    dietaryRestrictions?: string[];
    dislikedFoods?: string[];
    favoriteCuisines?: string[];
    householdSize?: number;
    cookingTimePreference?: string;
    kidFriendly?: boolean;
    groceryBudget?: number;
  }
): Promise<MealPlanSuggestion> {
  const openai = getOpenAI();

  const systemPrompt = `You are MealPilot, a helpful meal-planning assistant. Generate a weekly meal plan based on the user's request.

Return your response as valid JSON matching this structure:
{
  "title": "string - brief title for this meal plan",
  "meals": [
    {
      "dayOfWeek": 1,  // 0=Sunday, 1=Monday, ..., 6=Saturday
      "mealType": "dinner",  // breakfast, lunch, dinner, or snack
      "title": "Meal Name",
      "description": "Brief 1-sentence description",
      "servings": 4,
      "prepTimeMinutes": 15,
      "cookTimeMinutes": 30,
      "instructions": ["Step 1...", "Step 2..."],
      "ingredients": [
        {
          "name": "chicken breast",
          "quantity": 2,
          "unit": "lb",
          "notes": "boneless, skinless",
          "category": "meat"
        }
      ]
    }
  ]
}

Valid categories: produce, meat, seafood, dairy, bakery, pantry, frozen, beverages, spices, other

Guidelines:
- Generate practical, realistic meals
- Use common, accessible ingredients
- Be specific with quantities
- Categorize ingredients accurately
- Consider the user's stated preferences
- Default to dinner if the meal type isn't specified
- Default to 4 servings unless specified otherwise
- Keep instructions clear and numbered
- Only return valid JSON, no additional text`;

  const userContent = buildUserMessage(userMessage, preferences);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as MealPlanSuggestion;
}

export async function generateReplacementMeal(params: {
  currentMealTitle: string;
  dayOfWeek: number;
  mealType: string;
  existingMealTitles: string[];
  userMessage?: string;
  preferences?: {
    dietaryRestrictions?: string[];
    dislikedFoods?: string[];
    favoriteCuisines?: string[];
    householdSize?: number;
    cookingTimePreference?: string;
    kidFriendly?: boolean;
  };
}): Promise<MealSuggestion> {
  const openai = getOpenAI();

  const systemPrompt = `You are MealPilot, a helpful meal-planning assistant. The user wants to replace a meal in their existing plan.

Replace "${params.currentMealTitle}" for ${DAY_NAMES[params.dayOfWeek]} ${params.mealType}.

The plan already includes these meals — do NOT repeat any of them:
${params.existingMealTitles.map((t) => `- ${t}`).join('\n')}

Return your response as valid JSON matching this structure:
{
  "dayOfWeek": ${params.dayOfWeek},
  "mealType": "${params.mealType}",
  "title": "New Meal Name",
  "description": "Brief 1-sentence description",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "instructions": ["Step 1...", "Step 2..."],
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": 2,
      "unit": "lb",
      "notes": "optional notes",
      "category": "meat"
    }
  ]
}

Valid categories: produce, meat, seafood, dairy, bakery, pantry, frozen, beverages, spices, other

Only return valid JSON, no additional text.`;

  const userContent = params.userMessage
    ? buildUserMessage(params.userMessage, params.preferences)
    : buildUserMessage('Suggest a good replacement meal', params.preferences);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as MealSuggestion;
}

function buildUserMessage(
  userMessage: string,
  preferences?: {
    dietaryRestrictions?: string[];
    dislikedFoods?: string[];
    favoriteCuisines?: string[];
    householdSize?: number;
    cookingTimePreference?: string;
    kidFriendly?: boolean;
    groceryBudget?: number;
  }
): string {
  const contextParts: string[] = [];
  if (preferences) {
    if (preferences.dietaryRestrictions?.length) {
      contextParts.push(`Dietary restrictions: ${preferences.dietaryRestrictions.join(', ')}`);
    }
    if (preferences.dislikedFoods?.length) {
      contextParts.push(`Disliked foods: ${preferences.dislikedFoods.join(', ')}`);
    }
    if (preferences.favoriteCuisines?.length) {
      contextParts.push(`Favorite cuisines: ${preferences.favoriteCuisines.join(', ')}`);
    }
    if (preferences.householdSize) {
      contextParts.push(`Household size: ${preferences.householdSize}`);
    }
    if (preferences.cookingTimePreference) {
      contextParts.push(`Cooking time preference: ${preferences.cookingTimePreference}`);
    }
    if (preferences.kidFriendly) {
      contextParts.push('Needs kid-friendly meals');
    }
    if (preferences.groceryBudget) {
      contextParts.push(`Grocery budget: $${preferences.groceryBudget}`);
    }
  }

  return contextParts.length > 0
    ? `User preferences:\n${contextParts.join('\n')}\n\nUser request: ${userMessage}`
    : userMessage;
}
