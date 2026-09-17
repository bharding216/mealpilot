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
          "category": "meat"  // produce, meat, seafood, dairy, bakery, pantry, frozen, beverages, spices, other
        }
      ]
    }
  ]
}

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

  let contextParts: string[] = [];
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

  const userContent = contextParts.length > 0
    ? `User preferences:\n${contextParts.join('\n')}\n\nUser request: ${userMessage}`
    : userMessage;

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
