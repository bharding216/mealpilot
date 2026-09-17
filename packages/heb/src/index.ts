// ─── Grocery Provider Interface ───

export interface GroceryProviderProduct {
  productId: string;
  skuId: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  imageUrl: string | null;
  inStock: boolean;
}

export interface CartItem {
  productId: string;
  skuId: string;
  name: string;
  quantity: number;
  price: number | null;
  imageUrl: string | null;
}

export interface Cart {
  items: CartItem[];
  estimatedTotal: number | null;
}

export interface StoreInfo {
  storeId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface GroceryProvider {
  authenticate(credentials: Record<string, string>): Promise<void>;
  searchProducts(query: string, limit?: number): Promise<GroceryProviderProduct[]>;
  getCart(): Promise<Cart>;
  addToCart(productId: string, quantity: number): Promise<Cart>;
  updateCartItem(productId: string, quantity: number): Promise<Cart>;
  removeFromCart(productId: string): Promise<Cart>;
  getStoreInfo(): Promise<StoreInfo | null>;
  setStore(storeId: string): Promise<void>;
}

// ─── H-E-B Implementation (stub) ───

export class HebGroceryProvider implements GroceryProvider {
  private baseUrl = 'https://www.heb.com/graphql';
  private sessionToken: string | null = null;

  async authenticate(credentials: Record<string, string>): Promise<void> {
    // TODO: Implement H-E-B authentication
    // This will use the H-E-B GraphQL API to establish a session
    this.sessionToken = credentials.sessionToken ?? null;
  }

  async searchProducts(query: string, limit = 10): Promise<GroceryProviderProduct[]> {
    this._ensureAuthenticated();
    // TODO: Implement product search via H-E-B GraphQL
    // Operations: product search, typeahead search
    return [];
  }

  async getCart(): Promise<Cart> {
    this._ensureAuthenticated();
    // TODO: Implement cart retrieval via H-E-B GraphQL
    return { items: [], estimatedTotal: null };
  }

  async addToCart(productId: string, quantity: number): Promise<Cart> {
    this._ensureAuthenticated();
    // TODO: Implement add-to-cart via H-E-B GraphQL
    // Uses productId, skuId, quantity
    return this.getCart();
  }

  async updateCartItem(productId: string, quantity: number): Promise<Cart> {
    this._ensureAuthenticated();
    // TODO: Implement cart update via H-E-B GraphQL
    // quantity of 0 removes the item
    return this.getCart();
  }

  async removeFromCart(productId: string): Promise<Cart> {
    return this.updateCartItem(productId, 0);
  }

  async getStoreInfo(): Promise<StoreInfo | null> {
    this._ensureAuthenticated();
    // TODO: Implement store info retrieval
    return null;
  }

  async setStore(storeId: string): Promise<void> {
    this._ensureAuthenticated();
    // TODO: Implement store selection via H-E-B GraphQL
  }

  private _ensureAuthenticated(): void {
    if (!this.sessionToken) {
      throw new Error('HebGroceryProvider: not authenticated. Call authenticate() first.');
    }
  }
}
