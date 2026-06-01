// ── CONFIG ────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzDfs7_90-ses_2cNxUfrOFzucSTNZd6DrSMSgnQdfetqnMxcnSyL0y1WHs0Kcgc-m4/exec"; // same URL as appearance study

const STUDY_ID = "tau_control";
const TRIALS_PER_PARTICIPANT = 6;
const USERNAME_KEY = 'spaceflow_username'; // shared with landing page

// ── STATE ─────────────────────────────────────────────────────────────────
let trials = [];
let trialIndex = 0;
let currentUsername =
  localStorage.getItem(USERNAME_KEY) ||
  sessionStorage.getItem(`username_${STUDY_ID}`);

// ── USERNAME ──────────────────────────────────────────────────────────────
if (currentUsername) {
  hideModal();
  initStudy();
} else {
  document.getElementById('username-modal').style.display = 'flex'; // show only if needed
}

document.getElementById('username-submit').addEventListener('click', submitUsername);
document.getElementById('username-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') submitUsername();
});

function submitUsername() {
  const input = document.getElementById('username-input');
  const err   = document.getElementById('username-error');
  const name  = input.value.trim();
  if (!name) { err.textContent = 'Please enter a name to continue.'; return; }
  localStorage.setItem(USERNAME_KEY, name);
  sessionStorage.setItem(`username_${STUDY_ID}`, name);
  currentUsername = name;
  hideModal();
  initStudy();
}

function hideModal() {
  document.getElementById('username-modal').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('display-username').textContent = currentUsername || '';
}

// ── STUDY INIT ────────────────────────────────────────────────────────────
async function initStudy() {
  try {
    const res = await fetch('./trials_tau.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = await res.json();
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    trials = shuffled.slice(0, Math.min(TRIALS_PER_PARTICIPANT, shuffled.length));
    trialIndex = 0;
    loadNextTrial();
  } catch (err) {
    console.error('Failed to load trials_tau.json:', err);
    showMessage('Could not load study trials. Please refresh the page.', true);
  }
}

// ── LOAD TRIAL ────────────────────────────────────────────────────────────
function loadNextTrial() {
  if (trialIndex >= trials.length) { showCompletion(); return; }
  const trial = trials[trialIndex++];
  updateProgress();
  populateTrial(trial);
}

function populateTrial(trial) {
  document.getElementById('prompt-box').textContent = trial.prompt || '—';

  // Single reference image
  document.getElementById('ref-img').src = trial.ref;

  // Update part labels in instructions + questions
  const rigidLabel = trial.rigid_part || 'rigid part';
  const freeLabel  = trial.free_part  || 'free-form part';
  if (document.getElementById('rigid-part-label'))
    document.getElementById('rigid-part-label').textContent = rigidLabel;
  if (document.getElementById('free-part-label'))
    document.getElementById('free-part-label').textContent  = freeLabel;
  document.getElementById('q1-rigid').textContent = rigidLabel;
  document.getElementById('q2-free').textContent  = freeLabel;

  // Three output columns
  fillOutputs('imgs-a', trial.outputs_a);
  fillOutputs('imgs-b', trial.outputs_b);
  fillOutputs('imgs-c', trial.outputs_c);

  // Tracking
  setSpan('scene',          trial.scene_id);
  setSpan('model_a_method', trial.mapping.A);
  setSpan('model_b_method', trial.mapping.B);
  setSpan('model_c_method', trial.mapping.C);

  // Reset form
  document.querySelectorAll('#survey-form input[type="radio"]')
          .forEach(r => r.checked = false);
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('message').style.display = 'none';
  const btn = document.getElementById('submit-btn');
  btn.disabled = false;
  btn.textContent = 'Submit & Next →';
}

function fillOutputs(containerId, urls) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const label = { 'imgs-a': 'Sample A', 'imgs-b': 'Sample B', 'imgs-c': 'Sample C' }[containerId];
  (urls || []).forEach(url => container.appendChild(createMediaElement(url, label)));
}

function createMediaElement(url, altText) {
  const ext = url.split('.').pop().toLowerCase();
  if (ext === 'glb' || ext === 'gltf') {
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', url);
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('alt', altText);
    mv.setAttribute('shadow-intensity', '1');
    mv.style.width  = '100%';
    mv.style.height = '300px';
    return mv;
  } else if (ext === 'mp4' || ext === 'webm') {
    const v = document.createElement('video');
    v.src = url; v.autoplay = true; v.loop = true;
    v.muted = true; v.playsInline = true;
    v.style.cssText = 'width:100%;border-radius:6px;display:block;';
    return v;
  } else {
    const img = document.createElement('img');
    img.src = url; img.alt = altText;
    img.className = 'model-image'; img.loading = 'lazy';
    return img;
  }
}

function setSpan(id, value) {
  const el = document.getElementById(id);
  el.textContent = value;
  el.dataset.value = value;
}

// ── PROGRESS ──────────────────────────────────────────────────────────────
function updateProgress() {
  const pct = ((trialIndex - 1) / trials.length) * 100;
  document.getElementById('progress-text').textContent =
    `Trial ${trialIndex} of ${trials.length}`;
  document.getElementById('progress-fill').style.width = `${pct}%`;
}

// ── SUBMIT ────────────────────────────────────────────────────────────────
document.getElementById('survey-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const answers = {};
  let allAnswered = true;
  document.querySelectorAll('#survey-form .question').forEach((qDiv, idx) => {
    const name    = `q${idx + 1}`;
    const checked = qDiv.querySelector(`input[name="${name}"]:checked`);
    answers[name] = checked ? checked.value : null;
    if (!checked) allAnswered = false;
  });

  if (!allAnswered) {
    document.getElementById('form-error').style.display = 'block';
    return;
  }
  document.getElementById('form-error').style.display = 'none';

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {
    study_id:      STUDY_ID,
    username:      currentUsername,
    scene_id:      document.getElementById('scene').dataset.value,
    model_a_name:  document.getElementById('model_a_method').dataset.value,
    model_b_name:  document.getElementById('model_b_method').dataset.value,
    model_c_name:  document.getElementById('model_c_method').dataset.value,
    answers,
    timestamp:     new Date().toISOString(),
  };

  try {
    const params = new URLSearchParams({ data: JSON.stringify(payload) });
    await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, {
      method: 'GET', mode: 'no-cors',
    });
    await new Promise(r => setTimeout(r, 300));
    loadNextTrial();
  } catch (err) {
    console.error('Submit error:', err);
    showMessage('Error saving — please check your connection and try again.', true);
    btn.disabled = false;
    btn.textContent = 'Submit & Next →';
  }
});

// ── COMPLETION ────────────────────────────────────────────────────────────
function showCompletion() {
  document.getElementById('progress-fill').style.width = '100%';
  document.getElementById('progress-text').textContent =
    `${trials.length} of ${trials.length} — Complete`;
  ['task-card','references-section','outputs-section-3col','survey-section']
    .forEach(cls => {
      const el = document.querySelector('.' + cls);
      if (el) el.style.display = 'none';
    });
  document.querySelector('.page').insertAdjacentHTML('beforeend', `
    <div class="completion-card">
      <div class="completion-emoji">🎉</div>
      <div class="completion-title">Study 2 complete!</div>
      <div class="completion-text">
        Thank you, <strong>${currentUsername}</strong>!
        Your responses have been saved.<br><br>
        <a href="./index.html" style="color:var(--accent);font-weight:500;">
          ← Back to study selection
        </a>
      </div>
    </div>
  `);
}

function showMessage(msg, isError = false) {
  const box = document.getElementById('message');
  box.className = 'message ' + (isError ? 'error' : 'success');
  box.textContent = msg;
  box.style.display = 'block';
}