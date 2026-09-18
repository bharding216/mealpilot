// ─── Grocery Provider Interface ───

export interface GroceryProviderProduct {
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

export interface CartItem {
  productId: string;
  skuId: string;
  name: string;
  quantity: number;
  price: number | null;
  imageUrl: string | null;
  allowSubstitution: boolean;
}

export interface Cart {
  id: string;
  items: CartItem[];
  estimatedTotal: number | null;
  itemCount: number;
  store: StoreInfo | null;
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
  setSession(cookies: string): void;
  searchProducts(query: string, limit?: number): Promise<GroceryProviderProduct[]>;
  typeahead(term: string): Promise<string[]>;
  getCart(): Promise<Cart>;
  addToCart(productId: string, skuId: string, quantity: number): Promise<Cart>;
  updateCartItem(productId: string, skuId: string, quantity: number): Promise<Cart>;
  removeFromCart(productId: string, skuId: string): Promise<Cart>;
  getStoreInfo(): Promise<StoreInfo | null>;
}

// ─── Persisted Query Hashes (captured from live heb.com traffic) ───

const DEFAULT_HASHES: Record<string, string> = {
  typeaheadContent: '2c4ce4e9058185bc75dc3c24f3904e2c60cf7f15a7c316e6688dd7d7a8a22531',
  cartItemV2: 'f22a250636a883b5d3e3664d78c264fb6d3799e51c147da92bab210410568b49',
  cartEstimated: 'c14a956d6d675f23e63f87511bf2ce03573e2f9de29db226dadb5dca9063d3f7',
};

const GRAPHQL_URL = 'https://www.heb.com/graphql';

const DEFAULT_HEADERS: Record<string, string> = {
  'accept': 'application/json',
  'content-type': 'application/json',
  'apollographql-client-name': 'WebPlatform-Solar (Production)',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  'origin': 'https://www.heb.com',
  'referer': 'https://www.heb.com/',
};

// ─── H-E-B Implementation ───

export class HebGroceryProvider implements GroceryProvider {
  private cookies: string = '';
  private hashes: Record<string, string>;

  constructor(hashes?: Record<string, string>) {
    this.hashes = { ...DEFAULT_HASHES, ...hashes };
  }

  setSession(cookies: string): void {
    this.cookies = cookies;
  }

  setHashes(hashes: Record<string, string>): void {
    this.hashes = { ...this.hashes, ...hashes };
  }

  async searchProducts(query: string, limit = 5): Promise<GroceryProviderProduct[]> {
    this._ensureAuthenticated();

    // Use typeahead which returns product suggestions with details
    const body = {
      operationName: 'typeaheadContent',
      variables: { term: query, searchMode: 'MAIN_SEARCH' },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: this.hashes.typeaheadContent },
      },
    };

    const json = await this._graphql(body);
    const ta = json?.data?.typeaheadContent;
    if (!ta) return [];

    // Try suggestions array first (has full product details)
    const suggestions = ta.suggestions;
    if (Array.isArray(suggestions)) {
      return suggestions
        .filter((s: any) => s?.product)
        .slice(0, limit)
        .map((s: any) => this._parseTypeaheadProduct(s.product))
        .filter(Boolean) as GroceryProviderProduct[];
    }

    return [];
  }

  async typeahead(term: string): Promise<string[]> {
    this._ensureAuthenticated();

    const body = {
      operationName: 'typeaheadContent',
      variables: { term, searchMode: 'MAIN_SEARCH' },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: this.hashes.typeaheadContent },
      },
    };

    const json = await this._graphql(body);
    const stack = json?.data?.typeaheadContent?.verticalStack;
    if (!Array.isArray(stack)) return [];

    const terms: string[] = [];
    for (const entry of stack) {
      if (Array.isArray(entry.terms)) terms.push(...entry.terms);
    }
    return terms;
  }

  async getCart(): Promise<Cart> {
    this._ensureAuthenticated();

    const body = {
      operationName: 'cartEstimated',
      variables: { userIsLoggedIn: true },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: this.hashes.cartEstimated },
      },
    };

    const json = await this._graphql(body);
    const cart = json?.data?.cartV2;
    return this._parseCart(cart);
  }

  async addToCart(productId: string, skuId: string, quantity: number): Promise<Cart> {
    return this._cartMutation(productId, skuId, quantity);
  }

  async updateCartItem(productId: string, skuId: string, quantity: number): Promise<Cart> {
    return this._cartMutation(productId, skuId, quantity);
  }

  async removeFromCart(productId: string, skuId: string): Promise<Cart> {
    return this._cartMutation(productId, skuId, 0);
  }

  async getStoreInfo(): Promise<StoreInfo | null> {
    const cart = await this.getCart();
    return cart.store;
  }

  // ─── Private helpers ───

  private async _cartMutation(productId: string, skuId: string, quantity: number): Promise<Cart> {
    this._ensureAuthenticated();

    const body = {
      operationName: 'cartItemV2',
      variables: { userIsLoggedIn: true, productId, skuId, quantity },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: this.hashes.cartItemV2 },
      },
    };

    const json = await this._graphql(body);
    const cart = json?.data?.addItemToCartV2;
    return this._parseCart(cart);
  }

  private async _graphql(body: unknown): Promise<any> {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'cookie': this.cookies,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HEB GraphQL request failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    // Handle stale persisted query hashes gracefully
    const errors = (json as any).errors;
    if (errors?.length === 1 && errors[0].extensions?.code === 'PERSISTED_QUERY_NOT_FOUND') {
      throw new Error('PERSISTED_QUERY_NOT_FOUND');
    }

    if (errors?.length) {
      const msg = errors.map((e: any) => e.message).join('; ');
      throw new Error(`HEB GraphQL error: ${msg}`);
    }

    return json;
  }

  private _parseTypeaheadProduct(p: any): GroceryProviderProduct | null {
    if (!p) return null;
    return {
      productId: p.productId || p.id || '',
      skuId: p.skuId || p.sku || '',
      name: p.description || p.name || p.decodedDisplayName || '',
      brand: p.brand || null,
      size: p.unitSize || null,
      price: p.price?.regular ?? p.price?.sale ?? null,
      unitPrice: p.price?.unitPrice ?? null,
      imageUrl: p.image?.url ?? null,
      productUrl: null,
      inStock: p.inventory?.inStock !== false,
      category: null,
    };
  }

  private _parseCart(cart: any): Cart {
    if (!cart) {
      return { id: '', items: [], estimatedTotal: null, itemCount: 0, store: null };
    }

    const items: CartItem[] = (cart.items ?? []).map((item: any) => ({
      productId: item.productId ?? item.product?.id ?? '',
      skuId: item.skuId ?? item.sku?.id ?? '',
      name: item.description ?? item.product?.decodedDisplayName ?? item.product?.displayName ?? '',
      quantity: item.quantity ?? 0,
      price: item.price ?? item.itemPrice?.salePrice?.amount ?? item.itemPrice?.listPrice?.amount ?? null,
      imageUrl: item.image?.url ?? item.product?.thumbnailImageUrl ?? null,
      allowSubstitution: item.allowSubstitution ?? true,
    }));

    const store = cart.fulfillment?.store;
    const storeAddress = store?.address;
    const storeInfo: StoreInfo | null = store
      ? {
          storeId: store.id,
          name: store.name,
          address: storeAddress?.addressOne ?? store.address1 ?? '',
          city: storeAddress?.city ?? store.city ?? '',
          state: storeAddress?.state ?? store.state ?? '',
          zip: storeAddress?.zipCode ?? store.postalCode ?? '',
        }
      : null;

    return {
      id: cart.id ?? '',
      items,
      estimatedTotal: cart.price?.preTaxTotal?.amount ?? null,
      itemCount: cart.itemCount?.total ?? items.length,
      store: storeInfo,
    };
  }

  private _ensureAuthenticated(): void {
    if (!this.cookies) {
      throw new Error('HebGroceryProvider: no session. Call setSession() first.');
    }
  }
}
