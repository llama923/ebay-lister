// ================================================================
// app.js — Main application logic
// ================================================================

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const DESCRIPTIONS = {
  single: `This is an official TCG Pokémon card and is exactly as shown in the photos. This card will be shipped so that it is 100% protected and will not be affected during shipping. Feel free to message me with any questions!`,
  lot:    `This lot is official TCG Pokémon cards and is exactly as shown in the photos. You will receive every card shown in the photos. These cards will be shipped so that they are 100% protected and will not be affected during shipping. Feel free to message me with any questions!`,
  graded: `This is an official TCG Pokémon card and is exactly as shown in the photos. This card will be shipped so that it is 100% protected and will not be affected during shipping. Feel free to message me with any questions!`,
};

// Ungraded card condition labels (shown in dropdown)
const CONDITION_LABELS = {
  LIKE_NEW:      'Near Mint (NM)',
  VERY_GOOD:     'Lightly Played (LP)',
  GOOD:          'Moderately Played (MP)',
  ACCEPTABLE_HP: 'Heavily Played (HP)',
  ACCEPTABLE_D:  'Damaged (D)',
};

// For ungraded cards: eBay API condition is always USED_VERY_GOOD (4000)
// The actual card quality goes in conditionDescriptors
const CONDITION_API = {
  LIKE_NEW:      'USED_VERY_GOOD',
  VERY_GOOD:     'USED_VERY_GOOD',
  GOOD:          'USED_VERY_GOOD',
  ACCEPTABLE_HP: 'USED_VERY_GOOD',
  ACCEPTABLE_D:  'USED_VERY_GOOD',
};

// Ungraded condition descriptor: name=40001
// Category 183454 (CCG/Pokémon) uses different values than sports cards:
// Source: https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html
const CONDITION_DESCRIPTOR = {
  LIKE_NEW:      '400010',  // Near Mint or Better
  VERY_GOOD:     '400015',  // Lightly Played (Excellent)
  GOOD:          '400016',  // Moderately Played (Very Good)
  ACCEPTABLE_HP: '400017',  // Heavily Played (Poor)
  ACCEPTABLE_D:  '400017',  // Heavily Played (Poor) — no lower value exists for 183454
};

// Graded card: Professional Grader descriptor (27501) values
// Source: https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html
const GRADERS = [
  { label: 'PSA',   id: '275010' },
  { label: 'BGS',   id: '275013' },
  { label: 'CGC',   id: '275015' },
  { label: 'SGC',   id: '275016' },
  { label: 'BCCG',  id: '275011' },
  { label: 'BVG',   id: '275012' },
  { label: 'HGA',   id: '275019' },
  { label: 'GMA',   id: '275018' },
  { label: 'ISA',   id: '2750110' },
  { label: 'Other', id: '2750123' },
];

// Graded card: Grade descriptor (27502) values
const GRADES = [
  { label: '10',               id: '275020' },
  { label: '9.5',              id: '275021' },
  { label: '9',                id: '275022' },
  { label: '8.5',              id: '275023' },
  { label: '8',                id: '275024' },
  { label: '7.5',              id: '275025' },
  { label: '7',                id: '275026' },
  { label: '6.5',              id: '275027' },
  { label: '6',                id: '275028' },
  { label: '5.5',              id: '275029' },
  { label: '5',                id: '2750210' },
  { label: '4.5',              id: '2750211' },
  { label: '4',                id: '2750212' },
  { label: '3.5',              id: '2750213' },
  { label: '3',                id: '2750214' },
  { label: '2.5',              id: '2750215' },
  { label: '2',                id: '2750216' },
  { label: '1.5',              id: '2750217' },
  { label: '1',                id: '2750218' },
  { label: 'Authentic',        id: '2750219' },
  { label: 'Authentic Altered',id: '2750220' },
];

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let currentType  = 'single';   // 'single' | 'lot' | 'graded'
let formPhotos   = [];
let dragSrcIndex = null;
const queue      = [];

// ----------------------------------------------------------------
// SHIPPING RULES
//   Single card < $20        → eBay Standard Envelope (2oz, 4×8×1")
//   Single card ≥ $20        → USPS Ground Advantage small (3oz, 6×11×1")
//   Graded single ≤ $100     → USPS Ground Advantage small (3oz, 6×11×1")
//   Graded single > $100     → USPS Ground Advantage large (5oz, 7×11×5")
//   Lot, < 20 cards          → USPS Ground Advantage small (3oz, 6×11×1")
//   Lot, ≥ 20 cards, ≤ $200  → USPS Ground Advantage small (3oz, 6×11×1")
//   Lot, ≥ 20 cards, > $200  → USPS Ground Advantage large (5oz, 7×11×5")
// ----------------------------------------------------------------
function getShippingInfo(type, price, cardCount) {
  const p = parseFloat(price)   || 0;
  const c = parseInt(cardCount) || 0;

  const gaSmall = {
    policyKey:   'groundAdvantage',
    label:       'USPS Ground Advantage (6×11×1", 3oz)',
    packageType: 'MAILING_BOX',
    dimensions:  { length: 11, width: 6, height: 1, unit: 'INCH' },
    weight:      { value: 3, unit: 'OUNCE' },
  };

  const gaLarge = {
    policyKey:   'groundAdvantage',
    label:       'USPS Ground Advantage — Large (7×11×5", 5oz)',
    packageType: 'PACKAGE_THICK_ENVELOPE',
    dimensions:  { length: 11, width: 7, height: 5, unit: 'INCH' },
    weight:      { value: 5, unit: 'OUNCE' },
  };

  if (type === 'single' && p > 0 && p < 20) {
    return {
      policyKey:   'standardEnvelope',
      label:       'eBay Standard Envelope',
      packageType: 'LETTER',
      dimensions:  { length: 8, width: 4, height: 1, unit: 'INCH' },
      weight:      { value: 2, unit: 'OUNCE' },
    };
  }

  if (type === 'graded') {
    return p > 100 ? gaLarge : gaSmall;
  }

  if (type === 'lot' && c >= 20 && p > 200) return gaLarge;

  return gaSmall;
}

// ----------------------------------------------------------------
// FORM: LISTING TYPE TOGGLE
// ----------------------------------------------------------------
function setType(type) {
  currentType = type;

  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.type-btn[data-type="${type}"]`).classList.add('active');

  // Show/hide fields based on type
  const isGraded = type === 'graded';
  const isLot    = type === 'lot';

  document.getElementById('group-cardcount').style.display  = isLot     ? 'block' : 'none';
  document.getElementById('group-condition').style.display  = isGraded  ? 'none'  : 'block';
  document.getElementById('group-graded').style.display     = isGraded  ? 'block' : 'none';

  document.getElementById('input-description').value = DESCRIPTIONS[type] || DESCRIPTIONS.single;

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

// Convert any image file to JPEG before uploading to eBay.
// HEIC (iPhone default) requires special handling — browser canvas APIs
// cannot decode HEIC pixel data even when the browser can display them.
async function convertToJpeg(file) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  const isHeic = type === 'image/heic' || type === 'image/heif'
    || name.endsWith('.heic') || name.endsWith('.heif');

  // Already JPEG or PNG — no conversion needed
  if (!isHeic && (type === 'image/jpeg' || type === 'image/png')) {
    return file;
  }

  // Try Chrome's ImageDecoder API (Chrome 94+, may support HEIC on macOS)
  if (isHeic && 'ImageDecoder' in window) {
    try {
      const decoder = new ImageDecoder({ data: file.stream(), type: 'image/heic' });
      const result = await decoder.decode();
      const canvas = new OffscreenCanvas(
        result.image.displayWidth,
        result.image.displayHeight
      );
      canvas.getContext('2d').drawImage(result.image, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      return new File([blob], file.name.replace(/\.[^/.]+$/i, '.jpg'), { type: 'image/jpeg' });
    } catch (e) {
      console.warn('ImageDecoder failed for HEIC:', e);
    }
  }

  // Try createImageBitmap (works for non-HEIC formats)
  if (!isHeic) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      return await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob
          ? resolve(new File([blob], file.name.replace(/\.[^/.]+$/i, '.jpg'), { type: 'image/jpeg' }))
          : reject(), 'image/jpeg', 0.92);
      });
    } catch (e) {
      console.warn('Canvas conversion failed:', e);
    }
  }

  // HEIC conversion not possible in this browser —
  // show clear instructions for the user
  if (isHeic) {
    alert(
      'Your iPhone is saving photos in HEIC format, which cannot be uploaded to eBay.\n\n' +
      'Quick fix (30 seconds):\n' +
      'iPhone → Settings → Camera → Formats → Most Compatible\n\n' +
      'This makes your camera save as JPEG automatically. ' +
      'You only need to do this once.'
    );
    return null; // signal to skip this file
  }

  return file;
}

function handlePhotoInput(event) {
  const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
  addPhotos(files);
  event.target.value = '';
}

async function addPhotos(files) {
  for (const file of files) {
    const converted = await convertToJpeg(file);
    if (converted) { // null means user was shown an error and should fix their settings
      formPhotos.push({ file: converted, url: URL.createObjectURL(converted) });
    }
  }
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
  const cardCount = document.getElementById('input-cardcount').value;
  const desc      = document.getElementById('input-description').value.trim();

  // Validation
  if (!title)                           { showToast('⚠️ Title is required'); return; }
  if (!price || parseFloat(price) <= 0) { showToast('⚠️ Price is required');  return; }
  if (formPhotos.length === 0)          { showToast('⚠️ At least one photo is required'); return; }

  if (currentType === 'lot' && (!cardCount || parseInt(cardCount) < 1)) {
    showToast('⚠️ Enter the number of cards in this lot');
    return;
  }

  // Graded-specific fields
  let condition = null, conditionLabel = null, conditionApiValue = null,
      conditionDescriptorValue = null, graderId = null, gradeId = null,
      graderLabel = null, gradeLabel = null;

  if (currentType === 'graded') {
    graderId    = document.getElementById('input-grader').value;
    gradeId     = document.getElementById('input-grade').value;
    graderLabel = GRADERS.find(g => g.id === graderId)?.label || graderId;
    gradeLabel  = GRADES.find(g => g.id === gradeId)?.label   || gradeId;
    conditionApiValue = 'LIKE_NEW'; // eBay: LIKE_NEW = graded card
  } else {
    condition             = document.getElementById('input-condition').value;
    conditionLabel        = CONDITION_LABELS[condition];
    conditionApiValue     = CONDITION_API[condition];
    conditionDescriptorValue = CONDITION_DESCRIPTOR[condition];
  }

  const shipping = getShippingInfo(currentType, price, cardCount);

  const listing = {
    id:              `listing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type:            currentType,
    title,
    price:           parseFloat(price).toFixed(2),
    condition,
    conditionLabel,
    conditionApiValue,
    conditionDescriptorValue,
    graderId,
    gradeId,
    graderLabel,
    gradeLabel,
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

  // Scroll the form panel back to top so the toggle is always visible
  document.querySelector('.form-panel').scrollTop = 0;

  showToast('✅ Added to queue');
}

function resetForm() {
  document.getElementById('input-title').value       = '';
  document.getElementById('input-price').value       = '';
  document.getElementById('input-cardcount').value   = '';
  document.getElementById('input-description').value = DESCRIPTIONS[currentType] || DESCRIPTIONS.single;
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

// Pull a listing back out of the queue and into the form for editing
function editFromQueue(id) {
  const idx = queue.findIndex(l => l.id === id);
  if (idx === -1) return;
  const listing = queue[idx];

  setType(listing.type);
  document.getElementById('input-title').value       = listing.title;
  document.getElementById('input-price').value       = listing.price;
  document.getElementById('input-cardcount').value   = listing.cardCount || '';
  document.getElementById('input-description').value = listing.description;
  document.getElementById('title-count').textContent = listing.title.length;

  if (listing.type === 'graded') {
    document.getElementById('input-grader').value = listing.graderId || '';
    document.getElementById('input-grade').value  = listing.gradeId  || '';
  } else {
    document.getElementById('input-condition').value = listing.condition || 'LIKE_NEW';
  }

  formPhotos = [...listing.photos];
  renderPhotoStrip();
  updateShippingPreview();

  queue.splice(idx, 1);
  renderQueue();

  document.querySelector('.form-panel').scrollTop = 0;
  showToast('✏️ Listing moved back to form for editing');
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
          <span class="badge badge-type">${listing.type === 'single' ? 'Single' : listing.type === 'graded' ? 'Graded' : 'Lot'}</span>
          ${listing.type === 'graded'
            ? `<span class="badge badge-cond">${escHtml(listing.graderLabel)} ${escHtml(listing.gradeLabel)}</span>`
            : `<span class="badge badge-cond">${escHtml(listing.conditionLabel)}</span>`}
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
        ${(listing.status === 'pending' || listing.status === 'error') ? `
          <button class="btn-edit" onclick="editFromQueue('${listing.id}')" title="Edit">✏️ Edit</button>
          <button class="btn-remove" onclick="removeFromQueue('${listing.id}')" title="Remove">×</button>
        ` : ''}
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
