// ================================================================
// app.js — Main application logic
// Handles: listing form, queue management, shipping rules,
//          description templates, the "List All" flow
// ================================================================

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

// Auto-fill descriptions (from your provided templates)
const DESCRIPTIONS = {
  single: `This is an official TCG Pokémon card and is exactly as shown in the photos. This card will be shipped so that it is 100% protected and will not be affected during shipping. Feel free to message me with any questions!`,
  lot:    `This lot is official TCG Pokémon cards and is exactly as shown in the photos. You will receive every card shown in the photos. These cards will be shipped so that they are 100% protected and will not be affected during shipping. Feel free to message me with any questions!`,
};

// What's shown in the UI vs what the eBay API expects
const CONDITION_LABELS = {
  LIKE_NEW:      'Near Mint (NM)',
  VERY_GOOD:     'Lightly Played (LP)',
  GOOD:          'Moderately Played (MP)',
  ACCEPTABLE_HP: 'Heavily Played (HP)',
  ACCEPTABLE_D:  'Damaged (D)',
};

// eBay API condition enum values
const CONDITION_API = {
  LIKE_NEW:      'LIKE_NEW',
  VERY_GOOD:     'VERY_GOOD',
  GOOD:          'GOOD',
  ACCEPTABLE_HP: 'ACCEPTABLE',
  ACCEPTABLE_D:  'ACCEPTABLE',
};

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let currentType  = 'single';   // 'single' | 'lot'
let formPhotos   = [];          // { file: File, url: string }[]
let dragSrcIndex = null;        // for photo reorder drag-and-drop
const queue      = [];          // all listings waiting to be submitted

// ----------------------------------------------------------------
// SHIPPING RULES
// Returns the correct shipping config based on your business rules:
//
//   Single card, price < $20      → eBay Standard Envelope (2oz, 4×8×1")
//   Single card, price ≥ $20      → USPS Ground Advantage  (3oz, 6×11×1")
//   Card lot, count < 20          → USPS Ground Advantage  (3oz, 6×11×1")
//   Card lot, count ≥ 20, ≤ $200  → USPS Ground Advantage  (3oz, 6×11×1")
//   Card lot, count ≥ 20, > $200  → USPS Ground Advantage  (5oz, 7×11×5")
// ----------------------------------------------------------------
function getShippingInfo(type, price, cardCount) {
  const p = parseFloat(price)    || 0;
  const c = parseInt(cardCount)  || 0;

  if (type === 'single' && p > 0 && p < 20) {
    return {
      policyKey:   'standardEnvelope',
      label:       'eBay Standard Envelope',
      packageType: 'LETTER',
      dimensions:  { length: 8, width: 4, height: 1, unit: 'INCH' },
      weight:      { value: 2, unit: 'OUNCE' },
    };
  }

  if (type === 'lot' && c >= 20 && p > 200) {
    return {
      policyKey:   'groundAdvantage',
      label:       'USPS Ground Advantage — Large (7×11×5", 5oz)',
      packageType: 'PACKAGE_THICK_ENVELOPE',
      dimensions:  { length: 11, width: 7, height: 5, unit: 'INCH' },
      weight:      { value: 5, unit: 'OUNCE' },
    };
  }

  // All other cases: standard Ground Advantage small package
  return {
    policyKey:   'groundAdvantage',
    label:       'USPS Ground Advantage (6×11×1", 3oz)',
    packageType: 'LARGE_ENVELOPE_OR_FLAT',
    dimensions:  { length: 11, width: 6, height: 1, unit: 'INCH' },
    weight:      { value: 3, unit: 'OUNCE' },
  };
}

// ----------------------------------------------------------------
// FORM: LISTING TYPE TOGGLE
// ----------------------------------------------------------------
function setType(type) {
  currentType = type;

  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.type-btn[data-type="${type}"]`).classList.add('active');

  // Show card count input only for lots
  document.getElementById('group-cardcount').style.display = type === 'lot' ? 'block' : 'none';

  // Auto-fill description for the chosen type
  document.getElementById('input-description').value = DESCRIPTIONS[type];

  updateShippingPreview();
}

// ----------------------------------------------------------------
// FORM: LIVE SHIPPING PREVIEW
// Updates the shipping badge under the price/cardcount fields
// ----------------------------------------------------------------
function updateShippingPreview() {
  const price     = document.getElementById('input-price').value;
  const cardCount = document.getElementById('input-cardcount').value;
  const p         = parseFloat(price) || 0;

  const el = document.getElementById('shipping-preview');

  if (p <= 0) {
    el.textContent = '— enter a price to see shipping method';
    el.className = 'shipping-badge';
    return;
  }

  if (currentType === 'lot' && !document.getElementById('input-cardcount').value) {
    el.textContent = '— enter card count to confirm shipping';
    el.className = 'shipping-badge';
    return;
  }

  const info = getShippingInfo(currentType, price, cardCount);
  el.textContent = `📦 ${info.label}  ·  Buyer Pays`;
  el.className = 'shipping-badge shipping-active';
}

// ----------------------------------------------------------------
// FORM: TITLE CHARACTER COUNT
// ----------------------------------------------------------------
function handleTitleInput() {
  const len = document.getElementById('input-title').value.length;
  document.getElementById('title-count').textContent = len;
  document.getElementById('title-count').style.color = len > 70 ? '#f39c12' : '';
}

// ----------------------------------------------------------------
// PHOTO HANDLING
// ----------------------------------------------------------------
function handlePhotoInput(event) {
  const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
  addPhotos(files);
  event.target.value = ''; // reset so the same file can be added again if needed
}

function addPhotos(files) {
  files.forEach(file => {
    formPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  renderPhotoStrip();
}

function removePhoto(index) {
  URL.revokeObjectURL(formPhotos[index].url);
  formPhotos.splice(index, 1);
  renderPhotoStrip();
}

function renderPhotoStrip() {
  const strip    = document.getElementById('photo-strip');
  const dropZone = document.getElementById('photo-drop-zone');

  strip.innerHTML = '';

  formPhotos.forEach((photo, i) => {
    const thumb = document.createElement('div');
    thumb.className   = 'photo-thumb';
    thumb.draggable   = true;
    thumb.dataset.idx = i;
    thumb.innerHTML = `
      <img src="${photo.url}" alt="Photo ${i + 1}">
      <span class="photo-num">${i + 1}</span>
      <button class="photo-remove" onclick="removePhoto(${i})" title="Remove">×</button>
    `;

    // ── Drag-to-reorder ──
    thumb.addEventListener('dragstart', e => {
      dragSrcIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => thumb.classList.add('dragging'), 0);
    });
    thumb.addEventListener('dragend', () => {
      thumb.classList.remove('dragging');
      document.querySelectorAll('.photo-thumb').forEach(t => t.classList.remove('drag-over'));
    });
    thumb.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.photo-thumb').forEach(t => t.classList.remove('drag-over'));
      thumb.classList.add('drag-over');
    });
    thumb.addEventListener('drop', e => {
      e.preventDefault();
      thumb.classList.remove('drag-over');
      if (dragSrcIndex !== null && dragSrcIndex !== i) {
        const [moved] = formPhotos.splice(dragSrcIndex, 1);
        formPhotos.splice(i, 0, moved);
        dragSrcIndex = null;
        renderPhotoStrip();
      }
    });

    strip.appendChild(thumb);
  });

  // Show drop zone only when no photos are loaded
  dropZone.style.display = formPhotos.length === 0 ? 'flex' : 'none';
  strip.style.display    = formPhotos.length > 0  ? 'flex' : 'none';
}

function setupDropZone() {
  const zone = document.getElementById('photo-drop-zone');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addPhotos(files);
  });
}

// ----------------------------------------------------------------
// QUEUE: ADD LISTING
// ----------------------------------------------------------------
function addToQueue() {
  const title     = document.getElementById('input-title').value.trim();
  const price     = document.getElementById('input-price').value;
  const condition = document.getElementById('input-condition').value;
  const cardCount = document.getElementById('input-cardcount').value;
  const desc      = document.getElementById('input-description').value.trim();

  // Validation
  if (!title)                         { showToast('⚠️ Title is required'); return; }
  if (!price || parseFloat(price) <= 0) { showToast('⚠️ Price is required');  return; }
  if (formPhotos.length === 0)         { showToast('⚠️ At least one photo is required'); return; }
  if (currentType === 'lot' && (!cardCount || parseInt(cardCount) < 1)) {
    showToast('⚠️ Enter the number of cards in this lot');
    return;
  }

  const shipping = getShippingInfo(currentType, price, cardCount);

  const listing = {
    id:              `listing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type:            currentType,
    title,
    price:           parseFloat(price).toFixed(2),
    condition,
    conditionLabel:  CONDITION_LABELS[condition],
    conditionApiValue: CONDITION_API[condition],
    cardCount:       currentType === 'lot' ? parseInt(cardCount) : null,
    photos:          [...formPhotos],  // snapshot the current photo array
    description:     desc,
    shipping,
    status:          'pending',       // pending | uploading | creating | listed | error
    error:           null,
    listingId:       null,
    listingUrl:      null,
  };

  queue.push(listing);

  // Clear the photo array (don't revoke URLs — the queue still references them)
  formPhotos = [];
  resetForm();
  renderQueue();

  showToast('✅ Added to queue');
}

function resetForm() {
  document.getElementById('input-title').value       = '';
  document.getElementById('input-price').value       = '';
  document.getElementById('input-cardcount').value   = '';
  document.getElementById('input-description').value = DESCRIPTIONS[currentType];
  document.getElementById('title-count').textContent = '0';
  renderPhotoStrip();
  updateShippingPreview();
}

// ----------------------------------------------------------------
// QUEUE: REMOVE / CLEAR
// ----------------------------------------------------------------
function removeFromQueue(id) {
  const idx = queue.findIndex(l => l.id === id);
  if (idx === -1) return;
  queue[idx].photos.forEach(p => URL.revokeObjectURL(p.url));
  queue.splice(idx, 1);
  renderQueue();
}

function clearQueue() {
  const pending = queue.filter(l => l.status === 'pending').length;
  if (!confirm(`Remove all ${pending} pending listing(s) from the queue?`)) return;
  queue.filter(l => l.status === 'pending').forEach(l => {
    l.photos.forEach(p => URL.revokeObjectURL(p.url));
  });
  // Only remove pending ones — keep listed/error for reference
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === 'pending') queue.splice(i, 1);
  }
  renderQueue();
}

function clearCompleted() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === 'listed') {
      queue[i].photos.forEach(p => URL.revokeObjectURL(p.url));
      queue.splice(i, 1);
    }
  }
  renderQueue();
}

// ----------------------------------------------------------------
// QUEUE: RENDER
// ----------------------------------------------------------------
function renderQueue() {
  const grid    = document.getElementById('queue-grid');
  const empty   = document.getElementById('queue-empty');
  const footer  = document.getElementById('queue-footer');
  const clearBtn = document.getElementById('btn-clear');
  const countEl = document.getElementById('queue-count');

  const total      = queue.length;
  const pending    = queue.filter(l => l.status === 'pending').length;
  const listed     = queue.filter(l => l.status === 'listed').length;
  const hasListed  = listed > 0;

  countEl.textContent = `${total} item${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    empty.style.display   = 'block';
    grid.style.display    = 'none';
    footer.style.display  = 'none';
    clearBtn.style.display = 'none';
    return;
  }

  empty.style.display    = 'none';
  grid.style.display     = 'grid';
  footer.style.display   = 'block';
  clearBtn.style.display = pending > 0 ? 'inline-flex' : 'none';

  const listBtn = document.getElementById('btn-list-all');
  listBtn.textContent = pending > 0
    ? `List ${pending} Item${pending !== 1 ? 's' : ''} on eBay`
    : 'All items listed!';
  listBtn.disabled = pending === 0;

  // Show "Clear completed" button when there are listed items
  const clearCompletedBtn = document.getElementById('btn-clear-completed');
  if (clearCompletedBtn) {
    clearCompletedBtn.style.display = hasListed ? 'inline-flex' : 'none';
  }

  const STATUS_DISPLAY = {
    pending:   { icon: '⏳', label: 'Pending',            cls: 'st-pending'   },
    uploading: { icon: '⬆️', label: 'Uploading photos…',  cls: 'st-uploading' },
    creating:  { icon: '🔨', label: 'Creating listing…',  cls: 'st-creating'  },
    listed:    { icon: '✅', label: 'Listed!',             cls: 'st-listed'    },
    error:     { icon: '❌', label: 'Error',               cls: 'st-error'     },
  };

  grid.innerHTML = '';
  queue.forEach(listing => {
    const st       = STATUS_DISPLAY[listing.status] || STATUS_DISPLAY.pending;
    const thumbUrl = listing.photos[0]?.url || '';

    const card = document.createElement('div');
    card.className = `queue-item ${st.cls}`;
    card.dataset.id = listing.id;

    card.innerHTML = `
      <div class="qi-photo">
        ${thumbUrl
          ? `<img src="${thumbUrl}" alt="">`
          : `<div class="qi-no-photo">📷</div>`}
        <span class="qi-photo-count">${listing.photos.length}×</span>
      </div>
      <div class="qi-body">
        <div class="qi-title">${escHtml(listing.title)}</div>
        <div class="qi-price">$${listing.price}</div>
        <div class="qi-meta">
          <span class="badge badge-type">${listing.type === 'single' ? 'Single' : 'Lot'}</span>
          <span class="badge badge-cond">${escHtml(listing.conditionLabel)}</span>
          ${listing.cardCount ? `<span class="badge badge-count">${listing.cardCount} cards</span>` : ''}
        </div>
        <div class="qi-shipping">📦 ${escHtml(listing.shipping.label)}</div>
        ${listing.error ? `<div class="qi-error">${escHtml(listing.error)}</div>` : ''}
        ${listing.listingUrl
          ? `<a class="qi-link" href="${listing.listingUrl}" target="_blank">View on eBay →</a>`
          : ''}
      </div>
      <div class="qi-actions">
        <span class="status-badge ${st.cls}">${st.icon} ${st.label}</span>
        ${listing.status === 'pending'
          ? `<button class="btn-remove" onclick="removeFromQueue('${listing.id}')" title="Remove">×</button>`
          : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

// ----------------------------------------------------------------
// LIST ALL
// Iterates through pending items, calling createEbayListing for each
// ----------------------------------------------------------------
async function listAll() {
  const s = loadSettings();

  if (!s.workerUrl) {
    alert('No Worker URL set. Go to Settings → Step 1.'); return;
  }
  if (!s.accessToken && !s.refreshToken) {
    alert('eBay account not connected. Go to Settings → Step 3.'); return;
  }
  if (!s.policies.paymentPolicyId) {
    alert('First-Time Setup not complete. Go to Settings → Step 5.'); return;
  }

  const pending = queue.filter(l => l.status === 'pending');
  if (pending.length === 0) {
    alert('No pending listings to submit.'); return;
  }

  // Disable the button during the run
  const btn = document.getElementById('btn-list-all');
  btn.disabled = true;
  btn.textContent = `Working on ${pending.length} item${pending.length !== 1 ? 's' : ''}…`;

  let successCount = 0;
  let errorCount   = 0;

  for (const listing of pending) {
    await createEbayListing(listing);
    renderQueue(); // update UI after each one
    if (listing.status === 'listed') successCount++;
    else if (listing.status === 'error') errorCount++;
    // Small pause so the browser can repaint between items
    await new Promise(r => setTimeout(r, 100));
  }

  renderQueue(); // final refresh

  const msg = errorCount === 0
    ? `✅ All ${successCount} listing${successCount !== 1 ? 's' : ''} posted successfully!`
    : `Done — ${successCount} listed, ${errorCount} had errors. Check the queue for details.`;
  showToast(msg);
}

// ----------------------------------------------------------------
// VIEW SWITCHING (main ↔ settings)
// ----------------------------------------------------------------
function showView(view) {
  document.getElementById('view-main').style.display     = view === 'main'     ? 'flex' : 'none';
  document.getElementById('view-settings').style.display = view === 'settings' ? 'block' : 'none';

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');

  if (view === 'settings') renderSettings();
}

// ----------------------------------------------------------------
// UTILITY
// ----------------------------------------------------------------
function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Set default description
  document.getElementById('input-description').value = DESCRIPTIONS.single;

  // Wire up photo input
  document.getElementById('photo-input').addEventListener('change', handlePhotoInput);

  // Live updates
  document.getElementById('input-price').addEventListener('input', updateShippingPreview);
  document.getElementById('input-cardcount').addEventListener('input', updateShippingPreview);
  document.getElementById('input-title').addEventListener('input', handleTitleInput);

  // Photo drag-and-drop on the drop zone itself
  setupDropZone();

  // Check if eBay just redirected back with an auth code
  checkOAuthCallback();

  // Initial render
  renderPhotoStrip();
  renderQueue();
});
