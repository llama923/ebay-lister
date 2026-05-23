// ================================================================
// ebay.js — eBay API integration
// Handles: OAuth tokens, photo uploads, listing creation,
//          first-time policy setup
// ================================================================

// OAuth scopes we need to create and manage listings
const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

// ----------------------------------------------------------------
// BUILD OAUTH URL
// Constructs the eBay authorization URL the user is redirected to
// ----------------------------------------------------------------
function buildAuthUrl(settings) {
  const scopes = encodeURIComponent(EBAY_SCOPES);
  return `https://auth.ebay.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(settings.clientId)}` +
    `&redirect_uri=${encodeURIComponent(settings.ruName)}` +
    `&response_type=code` +
    `&scope=${scopes}`;
}

// ----------------------------------------------------------------
// CHECK OAUTH CALLBACK
// Called on page load — detects if eBay just redirected back
// with an authorization code in the URL
// ----------------------------------------------------------------
function checkOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  // Clean the code out of the URL bar immediately
  window.history.replaceState({}, document.title, window.location.pathname);

  // Exchange the code for real tokens
  exchangeCodeForToken(code);
}

async function exchangeCodeForToken(code) {
  const s = loadSettings();
  if (!s.workerUrl || !s.ruName) {
    alert('Worker URL or RuName not configured. Check Settings.');
    return;
  }

  try {
    const res = await fetch(`${s.workerUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: s.ruName }),
    });
    const data = await res.json();

    if (data.access_token) {
      const updated = loadSettings();
      updated.accessToken  = data.access_token;
      updated.refreshToken = data.refresh_token;
      updated.tokenExpiry  = Date.now() + (data.expires_in * 1000);
      saveSettings(updated);
      showToast('✅ eBay account connected!');
      // If user is already on the Settings page, refresh it
      if (document.getElementById('view-settings').style.display !== 'none') {
        renderSettings();
      }
    } else {
      alert('eBay login failed: ' + (data.error || JSON.stringify(data)));
    }
  } catch (err) {
    alert('Connection error: ' + err.message);
  }
}

// ----------------------------------------------------------------
// GET VALID ACCESS TOKEN
// Returns a working access token, refreshing it if it's expired.
// Access tokens last ~2 hours; refresh tokens last ~18 months.
// ----------------------------------------------------------------
async function getValidAccessToken() {
  const s = loadSettings();

  // Token is still valid (with a 5-minute safety buffer)
  if (s.accessToken && s.tokenExpiry && Date.now() < s.tokenExpiry - 300_000) {
    return s.accessToken;
  }

  // Need to refresh
  if (!s.refreshToken) {
    throw new Error('Not connected to eBay. Go to Settings → Step 3 and connect your account.');
  }
  if (!s.workerUrl) {
    throw new Error('Worker URL not set. Go to Settings → Step 1.');
  }

  const res = await fetch(`${s.workerUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: s.refreshToken }),
  });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Token refresh failed — please reconnect your eBay account in Settings.');
  }

  const updated = loadSettings();
  updated.accessToken = data.access_token;
  updated.tokenExpiry = Date.now() + (data.expires_in * 1000);
  saveSettings(updated);

  return data.access_token;
}

// ----------------------------------------------------------------
// EBAY API PROXY CALL
// All eBay REST calls go through the Cloudflare Worker
// endpoint: e.g. "/sell/inventory/v1/inventory_item/my-sku"
// ----------------------------------------------------------------
async function ebayCall(endpoint, method, body, accessToken) {
  const s = loadSettings();
  const res = await fetch(`${s.workerUrl}/ebay-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method, body, accessToken }),
  });
  return await res.json();
}

// ----------------------------------------------------------------
// UPLOAD ONE PHOTO
// Sends a File to the Worker, which forwards it to eBay's
// picture service and returns a hosted URL
// ----------------------------------------------------------------
async function uploadPhoto(file, accessToken) {
  const s = loadSettings();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('accessToken', accessToken);

  const res = await fetch(`${s.workerUrl}/media/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();

  if (!data.imageUrl) {
    throw new Error(data.error || 'Photo upload returned no URL');
  }
  return data.imageUrl;
}

// ----------------------------------------------------------------
// CREATE FULL EBAY LISTING
// Full flow for one listing:
//   1. Upload all photos → get eBay-hosted URLs
//   2. Create inventory item (the product record)
//   3. Create offer (the listing details + pricing)
//   4. Publish offer (makes it live on eBay)
//
// Updates listing.status as it goes so the UI shows live progress.
// ----------------------------------------------------------------
async function createEbayListing(listing) {
  const s = loadSettings();
  const accessToken = await getValidAccessToken();

  // ── 1. Upload photos ──────────────────────────────────────────
  listing.status = 'uploading';
  renderQueue();

  let imageUrls = [];
  try {
    for (const photo of listing.photos) {
      const url = await uploadPhoto(photo.file, accessToken);
      imageUrls.push(url);
    }
  } catch (err) {
    listing.status = 'error';
    listing.error = `Photo upload failed: ${err.message}`;
    return;
  }

  // ── 2. Create inventory item ───────────────────────────────────
  listing.status = 'creating';
  renderQueue();

  const sku = `pklstr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const inventoryBody = {
    availability: {
      shipToLocationAvailability: { quantity: 1 },
    },
    condition: listing.conditionApiValue,
    conditionDescription: listing.conditionLabel,
    packageWeightAndSize: {
      dimensions: listing.shipping.dimensions,
      packageType: listing.shipping.packageType,
      weight: listing.shipping.weight,
    },
    product: {
      title: listing.title,
      description: listing.description,
      imageUrls,
    },
  };

  const invRes = await ebayCall(
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    'PUT',
    inventoryBody,
    accessToken
  );

  // A successful PUT inventory item returns 204 (no content) or 200
  // An error returns an errors array
  if (invRes.errors && invRes.errors.length > 0) {
    listing.status = 'error';
    listing.error = `Inventory error: ${invRes.errors[0].message}`;
    return;
  }

  // ── 3. Create offer ────────────────────────────────────────────
  const fulfillmentPolicyId = listing.shipping.policyKey === 'standardEnvelope'
    ? s.policies.standardEnvelopePolicyId
    : s.policies.groundAdvantagePolicyId;

  const offerBody = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: listing.type === 'single'
      ? (s.categories.singleCard || '183454')
      : (s.categories.cardLot   || '183454'),
    listingDescription: listing.description,
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId: s.policies.paymentPolicyId,
      returnPolicyId:  s.policies.returnPolicyId,
      bestOfferTerms: {
        bestOfferEnabled: false,  // NO OFFERS — enforced
      },
    },
    merchantLocationKey: s.merchantLocationKey || 'pokelister-home',
    pricingSummary: {
      price: {
        value: String(listing.price),
        currency: 'USD',
      },
    },
  };

  const offerRes = await ebayCall('/sell/inventory/v1/offer', 'POST', offerBody, accessToken);

  if (!offerRes.offerId) {
    listing.status = 'error';
    listing.error = `Offer error: ${offerRes.errors?.[0]?.message || JSON.stringify(offerRes)}`;
    return;
  }

  // ── 4. Publish offer (makes it live) ──────────────────────────
  const publishRes = await ebayCall(
    `/sell/inventory/v1/offer/${offerRes.offerId}/publish`,
    'POST',
    {},
    accessToken
  );

  if (!publishRes.listingId) {
    listing.status = 'error';
    listing.error = `Publish error: ${publishRes.errors?.[0]?.message || JSON.stringify(publishRes)}`;
    return;
  }

  listing.status = 'listed';
  listing.listingId  = publishRes.listingId;
  listing.listingUrl = `https://www.ebay.com/itm/${publishRes.listingId}`;
}

// ================================================================
// FIRST-TIME SETUP — Creates all business policies on eBay
// ================================================================
async function setupEbayPolicies() {
  const s = loadSettings();
  const accessToken = await getValidAccessToken();
  const results = { success: [], errors: [] };

  // ── Inventory Location ─────────────────────────────────────────
  // Try to find an existing location first; create one if none exist
  const existingLocs = await ebayCall('/sell/inventory/v1/location', 'GET', null, accessToken);

  if (existingLocs.locations && existingLocs.locations.length > 0) {
    s.merchantLocationKey = existingLocs.locations[0].merchantLocationKey;
    results.success.push(`Using existing inventory location: "${s.merchantLocationKey}"`);
  } else {
    // Create a new location
    const locKey = 'pokelister-home';
    const locBody = {
      location: {
        address: {
          addressLine1:    s.address1   || '123 Main St',
          city:            s.city       || 'Beltsville',
          stateOrProvince: s.state      || 'MD',
          postalCode:      s.zipCode    || '20705',
          country: 'US',
        },
      },
      locationEnabled: true,
      locationTypes: ['WAREHOUSE'],
      name: 'PokeLister Home',
      merchantLocationStatus: 'ENABLED',
    };

    const locRes = await ebayCall(
      `/sell/inventory/v1/location/${locKey}`,
      'POST',
      locBody,
      accessToken
    );

    if (locRes.errors && locRes.errors.length > 0) {
      results.errors.push(`Location: ${locRes.errors[0].message}`);
    } else {
      s.merchantLocationKey = locKey;
      results.success.push('Inventory location created');
    }
  }

  // ── Return Policy: No Returns ──────────────────────────────────
  const returnRes = await ebayCall('/sell/account/v1/return_policy', 'POST', {
    name: 'PokeLister - No Returns',
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    returnsAccepted: false,
  }, accessToken);

  if (returnRes.returnPolicyId) {
    s.policies.returnPolicyId = returnRes.returnPolicyId;
    results.success.push(`Return policy created (ID: ${returnRes.returnPolicyId})`);
  } else {
    results.errors.push(`Return policy: ${returnRes.errors?.[0]?.message || JSON.stringify(returnRes)}`);
  }

  // ── Payment Policy: Immediate Payment ─────────────────────────
  const payRes = await ebayCall('/sell/account/v1/payment_policy', 'POST', {
    name: 'PokeLister - Immediate Payment',
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    immediatePay: true,
  }, accessToken);

  if (payRes.paymentPolicyId) {
    s.policies.paymentPolicyId = payRes.paymentPolicyId;
    results.success.push(`Payment policy created (ID: ${payRes.paymentPolicyId})`);
  } else {
    results.errors.push(`Payment policy: ${payRes.errors?.[0]?.message || JSON.stringify(payRes)}`);
  }

  // ── Fulfillment Policy A: eBay Standard Envelope ──────────────
  // Used for single cards under $20 (buyer pays $1.03 flat — 2oz rate)
  // NOTE: If USPS updates eSE rates, update the shippingCost value below.
  const eseRes = await ebayCall('/sell/account/v1/fulfillment_policy', 'POST', {
    name: 'PokeLister - eBay Standard Envelope',
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { value: 3, unit: 'DAY' },
    shipToLocations: {
      regionIncluded: [{ regionType: 'COUNTRY', regionName: 'US' }],
    },
    shippingOptions: [{
      costType: 'FLAT_RATE',
      optionType: 'DOMESTIC',
      shippingServices: [{
        shippingCarrierCode: 'USPS',
        shippingServiceCode: 'US_eBayStandardEnvelope',
        shippingCost:           { value: '1.03', currency: 'USD' },
        additionalShippingCost: { value: '0.00', currency: 'USD' },
      }],
    }],
  }, accessToken);

  if (eseRes.fulfillmentPolicyId) {
    s.policies.standardEnvelopePolicyId = eseRes.fulfillmentPolicyId;
    results.success.push(`eBay Standard Envelope policy created (ID: ${eseRes.fulfillmentPolicyId})`);
  } else {
    results.errors.push(`eSE policy: ${eseRes.errors?.[0]?.message || JSON.stringify(eseRes)}`);
  }

  // ── Fulfillment Policy B: USPS Ground Advantage ───────────────
  // Used for single cards ≥$20 and all lots.
  // Calculated shipping — eBay computes the buyer's cost using
  // the package dimensions set on each inventory item.
  // NOTE: The service code "USPSParcel" is eBay's API name for USPS Ground Advantage.
  const gaRes = await ebayCall('/sell/account/v1/fulfillment_policy', 'POST', {
    name: 'PokeLister - USPS Ground Advantage',
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { value: 3, unit: 'DAY' },
    shipToLocations: {
      regionIncluded: [{ regionType: 'COUNTRY', regionName: 'US' }],
    },
    shippingOptions: [{
      costType: 'CALCULATED',
      optionType: 'DOMESTIC',
      packageHandlingCost: { value: '0.00', currency: 'USD' },
      shippingServices: [{
        shippingCarrierCode: 'USPS',
        shippingServiceCode: 'USPSParcel',
      }],
    }],
  }, accessToken);

  if (gaRes.fulfillmentPolicyId) {
    s.policies.groundAdvantagePolicyId = gaRes.fulfillmentPolicyId;
    results.success.push(`USPS Ground Advantage policy created (ID: ${gaRes.fulfillmentPolicyId})`);
  } else {
    results.errors.push(`GA policy: ${gaRes.errors?.[0]?.message || JSON.stringify(gaRes)}`);
  }

  // Save all collected IDs
  saveSettings(s);
  return results;
}
