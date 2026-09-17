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
  getCart(): Promise<Cart>;
  addToCart(productId: string, skuId: string, quantity: number): Promise<Cart>;
  updateCartItem(productId: string, skuId: string, quantity: number): Promise<Cart>;
  removeFromCart(productId: string, skuId: string): Promise<Cart>;
  getStoreInfo(): Promise<StoreInfo | null>;
}

// ─── Persisted Query Hashes (reverse-engineered from heb.com) ───

const HASHES = {
  typeaheadContent: '2c4ce4e9058185bc75dc3c24f3904e2c60cf7f15a7c316e6688dd7d7a8a22531',
  cartItemV2: 'f22a250636a883b5d3e3664d78c264fb6d3799e51c147da92bab210410568b49',
  cartEstimated: '0784bca75357ce90cf0fe444091a3b4a1b04339bf46ffca503f4e2e34ff5c566',
} as const;

const GRAPHQL_URL = 'https://www.heb.com/graphql';

const DEFAULT_HEADERS: Record<string, string> = {
  'accept': '*/*',
  'accept-language': 'en',
  'content-type': 'application/json',
  'apollographql-client-name': 'WebPlatform-Solar (Production)',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  'origin': 'https://www.heb.com',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

// ─── H-E-B Implementation ───

export class HebGroceryProvider implements GroceryProvider {
  private cookies: string = '';
  private clientVersion: string = 'e876ec288c2cdcdf239b3c23e2d13eb06e3741de';

  /**
   * Set the session cookies captured from an authenticated HEB browser session.
   * Must include at minimum the `sat` (auth JWT) cookie.
   */
  setSession(cookies: string): void {
    this.cookies = cookies;
  }

  /**
   * Search for products using the HEB search endpoint.
   * Returns parsed product results with IDs, SKUs, prices, and images.
   */
  async searchProducts(query: string, limit = 10): Promise<GroceryProviderProduct[]> {
    this._ensureAuthenticated();

    const searchUrl = `https://www.heb.com/_next/data/${this.clientVersion}/en/search.json?q=${encodeURIComponent(query)}`;

    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'cookie': this.cookies,
        'referer': `https://www.heb.com/search?q=${encodeURIComponent(query)}`,
      },
    });

    if (!res.ok) {
      throw new Error(`HEB search failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as any;

    // Navigate the response structure to find products
    const layout = json?.pageProps?.layout;
    if (!layout) return [];

    const searchGrid = layout.visualComponents?.find(
      (vc: any) => vc.type === 'searchGridV2'
    );
    if (!searchGrid) return [];

    // Products are nested inside the grid items
    const items: any[] = searchGrid.items ?? searchGrid.products ?? [];

    return items.slice(0, limit).map((item: any) => this._parseProduct(item)).filter(Boolean) as GroceryProviderProduct[];
  }

  /**
   * Typeahead search for autocomplete suggestions.
   */
  async typeahead(term: string): Promise<string[]> {
    this._ensureAuthenticated();

    const body = {
      operationName: 'typeaheadContent',
      variables: { term, searchMode: 'MAIN_SEARCH' },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: HASHES.typeaheadContent },
      },
    };

    const json = await this._graphql(body);
    const suggestions = json?.data?.typeaheadContent?.verticalStack?.[0]?.terms;
    return Array.isArray(suggestions) ? suggestions : [];
  }

  /**
   * Retrieve the current cart.
   */
  async getCart(): Promise<Cart> {
    this._ensureAuthenticated();

    const body = {
      operationName: 'cartEstimated',
      variables: { userIsLoggedIn: true },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: HASHES.cartEstimated },
      },
    };

    const json = await this._graphql(body, 'https://www.heb.com/cart');
    const cart = json?.data?.cartV2;
    return this._parseCart(cart);
  }

  /**
   * Add an item to the cart (or update quantity if already present).
   */
  async addToCart(productId: string, skuId: string, quantity: number): Promise<Cart> {
    return this._cartMutation(productId, skuId, quantity);
  }

  /**
   * Update the quantity of an item already in the cart.
   */
  async updateCartItem(productId: string, skuId: string, quantity: number): Promise<Cart> {
    return this._cartMutation(productId, skuId, quantity);
  }

  /**
   * Remove an item from the cart (quantity = 0).
   */
  async removeFromCart(productId: string, skuId: string): Promise<Cart> {
    return this._cartMutation(productId, skuId, 0);
  }

  /**
   * Get store info from the current cart's fulfillment data.
   */
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
        persistedQuery: { version: 1, sha256Hash: HASHES.cartItemV2 },
      },
    };

    const json = await this._graphql(body, 'https://www.heb.com/cart');
    const cart = json?.data?.addItemToCartV2;
    return this._parseCart(cart);
  }

  private async _graphql(body: unknown, referer?: string): Promise<any> {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'cookie': this.cookies,
        'apollographql-client-version': this.clientVersion,
        'referer': referer ?? 'https://www.heb.com/',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HEB GraphQL request failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    if ((json as any).errors?.length) {
      const msg = (json as any).errors.map((e: any) => e.message).join('; ');
      throw new Error(`HEB GraphQL error: ${msg}`);
    }
    return json;
  }

  private _parseProduct(item: any): GroceryProviderProduct | null {
    // Product data can be at the top level or nested under `.product`
    const product = item.product ?? item;
    if (!product?.id) return null;

    const sku = product.SKUs?.[0];
    const contextPrice = sku?.contextPrices?.find((p: any) => p.context === 'CURBSIDE')
      ?? sku?.contextPrices?.[0];

    return {
      productId: product.id,
      skuId: sku?.id ?? '',
      name: product.decodedDisplayName ?? product.displayName ?? product.fullDisplayName ?? '',
      brand: product.brand?.name ?? null,
      size: sku?.customerFriendlySize ?? null,
      price: contextPrice?.listPrice?.amount ?? contextPrice?.salePrice?.amount ?? null,
      unitPrice: contextPrice?.unitListPrice
        ? `${contextPrice.unitListPrice.formattedAmount}/${contextPrice.unitListPrice.unit}`
        : null,
      imageUrl: product.thumbnailImageUrl ?? product.productImageUrls?.[0]?.url ?? null,
      productUrl: product.productPageURL ?? null,
      inStock: product.inStock ?? product.inventory?.inventoryState === 'IN_STOCK',
      category: product.fullCategoryHierarchy ?? product.productCategory?.name ?? null,
    };
  }

  private _parseCart(cart: any): Cart {
    if (!cart) {
      return { id: '', items: [], estimatedTotal: null, itemCount: 0, store: null };
    }

    const items: CartItem[] = (cart.items ?? []).map((item: any) => ({
      productId: item.product?.id ?? '',
      skuId: item.sku?.id ?? '',
      name: item.product?.decodedDisplayName ?? item.product?.displayName ?? '',
      quantity: item.quantity ?? 0,
      price: item.itemPrice?.salePrice?.amount ?? item.itemPrice?.listPrice?.amount ?? null,
      imageUrl: item.product?.thumbnailImageUrl ?? null,
      allowSubstitution: item.allowSubstitution ?? true,
    }));

    const store = cart.fulfillment?.store;
    const storeInfo: StoreInfo | null = store
      ? {
          storeId: store.id,
          name: store.name,
          address: store.address1 ?? '',
          city: store.city ?? '',
          state: store.state ?? '',
          zip: store.postalCode ?? '',
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
