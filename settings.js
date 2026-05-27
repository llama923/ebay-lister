// ================================================================
// settings.js — Settings storage and Settings page rendering
// ================================================================

const DEFAULT_SETTINGS = {
  workerUrl: '',
  clientId: '',
  ruName: '',
  accessToken: '',
  refreshToken: '',
  tokenExpiry: 0,
  address1: '',
  city: '',
  state: '',
  zipCode: '',
  merchantLocationKey: 'pokelister-home',
  policies: {
    standardEnvelopePolicyId: '',
    groundAdvantagePolicyId: '',
    paymentPolicyId: '',
    returnPolicyId: '',
  },
  categories: {
    singleCard: '183454',
    cardLot: '183455',
  },
};

function loadSettings() {
  try {
    const stored = localStorage.getItem('pokelister-settings');
    const parsed = stored ? JSON.parse(stored) : {};
    // Deep merge so nested objects (like policies) don't get wiped
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      policies: { ...DEFAULT_SETTINGS.policies, ...(parsed.policies || {}) },
      categories: { ...DEFAULT_SETTINGS.categories, ...(parsed.categories || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem('pokelister-settings', JSON.stringify(settings));
}

// ----------------------------------------------------------------
// Render the full Settings view
// ----------------------------------------------------------------
function renderSettings() {
  const s = loadSettings();
  const isConnected = !!(s.accessToken && s.tokenExpiry > Date.now());
  const isPoliciesReady = !!(
    s.policies.standardEnvelopePolicyId &&
    s.policies.groundAdvantagePolicyId &&
    s.policies.paymentPolicyId &&
    s.policies.returnPolicyId
  );

  document.getElementById('settings-content').innerHTML = `

    <!-- ── Step 1: Worker URL ── -->
    <div class="settings-section">
      <div class="step-badge">Step 1</div>
      <h3>Cloudflare Worker URL</h3>
      <p class="settings-desc">
        This is the URL of the Cloudflare Worker you deployed — the same way you did for PokePrice.
        It handles all communication with eBay's API.
      </p>
      <div class="form-group">
        <label>Worker URL</label>
        <input type="url" id="s-worker-url"
          value="${escHtml(s.workerUrl)}"
          placeholder="https://your-worker.workers.dev">
      </div>
      <button class="btn-primary" onclick="saveField('workerUrl', 's-worker-url')">Save</button>
      ${s.workerUrl ? '<span class="saved-note">✅ Saved</span>' : ''}
    </div>

    <!-- ── Step 2: eBay App Credentials ── -->
    <div class="settings-section">
      <div class="step-badge">Step 2</div>
      <h3>eBay Developer Credentials</h3>
      <p class="settings-desc">
        From <strong>developer.ebay.com</strong> → My Account → Application Keys (Production environment).
        The Client Secret goes into your Cloudflare Worker's environment variables — not here.
      </p>
      <div class="form-group">
        <label>Client ID (App ID)</label>
        <input type="text" id="s-client-id"
          value="${escHtml(s.clientId)}"
          placeholder="YourName-AppName-PRD-xxxxxxxx-xxxxxxxx">
      </div>
      <div class="form-group">
        <label>RuName <span class="label-note">(your OAuth Redirect URI name)</span></label>
        <input type="text" id="s-runame"
          value="${escHtml(s.ruName)}"
          placeholder="YourName-AppName-PRD-xxxxxxxx">
        <span class="field-note">
          Find this under Application Keys → click <em>User Tokens</em> next to your Client ID.
          Set the Accept URL to: <code>https://llama923.github.io/ebay-lister/</code>
        </span>
      </div>
      <button class="btn-primary" onclick="saveCredentials()">Save Credentials</button>
      ${(s.clientId && s.ruName) ? '<span class="saved-note">✅ Saved</span>' : ''}
    </div>

    <!-- ── Step 3: Connect eBay Account ── -->
    <div class="settings-section">
      <div class="step-badge">Step 3</div>
      <h3>Connect Your eBay Seller Account</h3>
      <p class="settings-desc">
        This logs you in to authorize the app to create listings on your behalf.
        You only do this once — the app stays connected automatically.
      </p>
      <div class="connection-status">
        <span class="status-dot ${isConnected ? 'dot-green' : 'dot-red'}"></span>
        <span class="status-label">${isConnected ? 'Connected' : 'Not connected'}</span>
        ${isConnected ? `<span class="token-note">Token valid until: ${new Date(s.tokenExpiry).toLocaleString()}</span>` : ''}
      </div>
      <button class="btn-primary" onclick="connectEbay()" ${(!s.clientId || !s.ruName) ? 'disabled title="Save credentials first"' : ''}>
        ${isConnected ? '🔄 Reconnect' : '🔗 Connect eBay Account'}
      </button>
    </div>

    <!-- ── Step 4: Seller Location ── -->
    <div class="settings-section">
      <div class="step-badge">Step 4</div>
      <h3>Your Shipping Origin Address</h3>
      <p class="settings-desc">
        Where you ship from. eBay uses this to calculate Ground Advantage shipping rates for buyers.
      </p>
      <div class="form-group">
        <label>Street Address</label>
        <input type="text" id="s-address1" value="${escHtml(s.address1)}" placeholder="123 Main St">
      </div>
      <div class="form-row">
        <div class="form-group flex-2">
          <label>City</label>
          <input type="text" id="s-city" value="${escHtml(s.city)}" placeholder="Beltsville">
        </div>
        <div class="form-group flex-1">
          <label>State</label>
          <input type="text" id="s-state" value="${escHtml(s.state)}" placeholder="MD" maxlength="2" style="text-transform:uppercase">
        </div>
        <div class="form-group flex-1">
          <label>ZIP Code</label>
          <input type="text" id="s-zip" value="${escHtml(s.zipCode)}" placeholder="20705" maxlength="5">
        </div>
      </div>
      <button class="btn-primary" onclick="saveLocation()">Save Address</button>
      ${s.zipCode ? '<span class="saved-note">✅ Saved</span>' : ''}
    </div>

    <!-- ── Step 5: First-Time Setup ── -->
    <div class="settings-section">
      <div class="step-badge">Step 5</div>
      <h3>First-Time Setup</h3>
      <p class="settings-desc">
        Creates your eBay business policies (shipping rules, payment, returns) automatically.
        Run this once after completing Steps 1–4. If it's already been run, the checkmarks below will be filled.
      </p>
      <div class="policy-checklist">
        ${renderPolicyChecklist(s)}
      </div>
      <button class="btn-primary" id="btn-setup"
        onclick="runSetup()"
        ${!isConnected ? 'disabled title="Connect your eBay account first (Step 3)"' : ''}>
        ${isPoliciesReady ? '🔄 Re-run Setup' : '▶ Run First-Time Setup'}
      </button>
      <div id="setup-log" class="setup-log"></div>
    </div>

    <!-- ── Advanced: Category IDs ── -->
    <div class="settings-section settings-section-secondary">
      <h3>Advanced — eBay Category IDs</h3>
      <p class="settings-desc">
        The eBay category your listings are filed under. Defaults work for most Pokémon TCG cards.
        If listings are rejected for wrong category, verify these at
        <a href="https://www.ebay.com/sch/categories.html" target="_blank">ebay.com/sch/categories.html</a>.
      </p>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Single Card Category ID</label>
          <input type="text" id="s-cat-single" value="${s.categories.singleCard}" placeholder="183454">
        </div>
        <div class="form-group flex-1">
          <label>Card Lot Category ID</label>
          <input type="text" id="s-cat-lot" value="${s.categories.cardLot}" placeholder="183455">
        </div>
      </div>
      <button class="btn-secondary" onclick="saveCategories()">Save Category IDs</button>
    </div>

  `;
}

function renderPolicyChecklist(s) {
  const p = s.policies;
  const items = [
    { label: 'eBay Standard Envelope policy',   id: p.standardEnvelopePolicyId },
    { label: 'USPS Ground Advantage policy',     id: p.groundAdvantagePolicyId },
    { label: 'Payment policy',                   id: p.paymentPolicyId },
    { label: 'Return policy (no returns)',        id: p.returnPolicyId },
  ];
  return items.map(item => `
    <div class="policy-row">
      <span class="policy-check ${item.id ? 'check-done' : 'check-empty'}">${item.id ? '✅' : '⬜'}</span>
      <span class="policy-name">${item.label}</span>
      ${item.id ? `<code class="policy-id">${item.id.slice(0, 12)}…</code>` : ''}
    </div>
  `).join('');
}

// ----------------------------------------------------------------
// Save helpers
// ----------------------------------------------------------------
function saveField(key, inputId) {
  const val = document.getElementById(inputId).value.trim();
  const s = loadSettings();
  s[key] = val;
  saveSettings(s);
  showToast(`Saved!`);
  renderSettings();
}

function saveCredentials() {
  const s = loadSettings();
  s.clientId = document.getElementById('s-client-id').value.trim();
  s.ruName = document.getElementById('s-runame').value.trim();
  saveSettings(s);
  showToast('Credentials saved!');
  renderSettings();
}

function saveLocation() {
  const s = loadSettings();
  s.address1 = document.getElementById('s-address1').value.trim();
  s.city     = document.getElementById('s-city').value.trim();
  s.state    = document.getElementById('s-state').value.trim().toUpperCase();
  s.zipCode  = document.getElementById('s-zip').value.trim();
  saveSettings(s);
  showToast('Address saved!');
  renderSettings();
}

function saveCategories() {
  const s = loadSettings();
  s.categories.singleCard = document.getElementById('s-cat-single').value.trim() || '183454';
  s.categories.cardLot    = document.getElementById('s-cat-lot').value.trim()    || '183454';
  saveSettings(s);
  showToast('Category IDs saved!');
}

// ----------------------------------------------------------------
// eBay OAuth — redirect to eBay login
// ----------------------------------------------------------------
function connectEbay() {
  const s = loadSettings();
  if (!s.clientId || !s.ruName) {
    alert('Please save your Client ID and RuName first (Step 2).');
    return;
  }
  const url = buildAuthUrl(s);
  window.location.href = url;
}

// ----------------------------------------------------------------
// First-Time Setup — calls ebay.js setupEbayPolicies()
// ----------------------------------------------------------------
async function runSetup() {
  const btn = document.getElementById('btn-setup');
  const log = document.getElementById('setup-log');

  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  log.innerHTML = '<div class="log-info">Setting up your eBay policies... this may take a few seconds.</div>';

  try {
    const results = await setupEbayPolicies();
    let html = '';
    results.success.forEach(msg => { html += `<div class="log-success">✅ ${escHtml(msg)}</div>`; });
    results.errors.forEach(msg  => { html += `<div class="log-error">❌ ${escHtml(msg)}</div>`; });

    if (results.errors.length === 0) {
      html += '<div class="log-success"><strong>Setup complete! You\'re ready to list.</strong></div>';
    } else {
      html += '<div class="log-info">Some steps had errors. Check the messages above.</div>';
    }
    log.innerHTML = html;
    renderSettings(); // refresh checkmarks
  } catch (err) {
    log.innerHTML = `<div class="log-error">❌ Setup failed: ${escHtml(err.message)}</div>`;
  }

  btn.disabled = false;
  btn.textContent = '🔄 Re-run Setup';
}

// ----------------------------------------------------------------
// Toast notification
// ----------------------------------------------------------------
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2200);
}
