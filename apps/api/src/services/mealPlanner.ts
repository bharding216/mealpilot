import { getOpenAI } from './openai.js';

// ─── Types ───

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

interface MealOption {
  title: string;
  description: string;
  estimatedTime: string;
  tags: string[];
}

interface ChatSuggestResult {
  reply: string;
  suggestions: MealOption[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Chat-based suggestion (lightweight, no recipes) ───

export async function generateMealSuggestions(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  existingMealTitles: string[],
  preferences?: {
    dietaryRestrictions?: string[];
    dislikedFoods?: string[];
    favoriteCuisines?: string[];
    householdSize?: number;
    cookingTimePreference?: string;
    kidFriendly?: boolean;
    groceryBudget?: number;
  }
): Promise<ChatSuggestResult> {
  const openai = getOpenAI();

  const existingMealsContext = existingMealTitles.length > 0
    ? `\n\nMeals already in the plan (do NOT repeat these):\n${existingMealTitles.map((t) => `- ${t}`).join('\n')}`
    : '';

  const systemPrompt = `You are MealPilot, a friendly and knowledgeable meal-planning assistant. You help users discover meals they'll love.

Your job is to have a natural conversation and suggest 2-3 specific meal options based on what the user asks for. Do NOT generate full recipes or ingredient lists — just suggest meals with brief, appetizing descriptions.

Return your response as valid JSON:
{
  "reply": "A friendly conversational message (1-3 sentences). Introduce your suggestions naturally. Be warm and enthusiastic but not over-the-top.",
  "suggestions": [
    {
      "title": "Meal Name",
      "description": "1-2 sentence appetizing description of the meal",
      "estimatedTime": "30 min",
      "tags": ["high-protein", "kid-friendly", "italian"]
    }
  ]
}

Guidelines:
- Always suggest exactly 2-3 meal options
- Make descriptions appetizing and specific (mention key flavors/techniques)
- Tags should be relevant attributes (cuisine, diet, time, family-friendly, etc.)
- Consider the full conversation history to refine suggestions
- If the user is vague, suggest diverse options and ask follow-up questions in your reply
- Be conversational — reference what the user said${existingMealsContext}

Only return valid JSON, no additional text.`;

  const userContent = buildUserMessage(userMessage, preferences);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of conversationHistory.slice(-8)) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.9,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  return JSON.parse(content) as ChatSuggestResult;
}

// ─── Generate a full recipe for a selected meal ───

export async function generateRecipeForMeal(
  mealTitle: string,
  mealDescription: string,
  dayOfWeek: number,
  mealType: string,
  preferences?: {
    dietaryRestrictions?: string[];
    dislikedFoods?: string[];
    favoriteCuisines?: string[];
    householdSize?: number;
    cookingTimePreference?: string;
    kidFriendly?: boolean;
  }
): Promise<MealSuggestion> {
  const openai = getOpenAI();

  const systemPrompt = `You are MealPilot. Generate a complete recipe for the following meal.

Meal: "${mealTitle}"
Description: "${mealDescription}"
Day: ${DAY_NAMES[dayOfWeek]}
Meal type: ${mealType}

Return your response as valid JSON:
{
  "dayOfWeek": ${dayOfWeek},
  "mealType": "${mealType}",
  "title": "${mealTitle}",
  "description": "Brief description",
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

Guidelines:
- Be specific with quantities and ingredient names
- Keep instructions clear and numbered (6-10 steps)
- Only return valid JSON, no additional text`;

  const userContent = buildUserMessage(
    `Generate a complete recipe for "${mealTitle}" — ${mealDescription}`,
    preferences,
  );

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  return JSON.parse(content) as MealSuggestion;
}

// ─── Legacy: Generate a full meal plan in one shot ───

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
