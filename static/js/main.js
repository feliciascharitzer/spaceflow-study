// ── CONFIG ────────────────────────────────────────────────────────────────
// Step 4: paste your Google Apps Script URL here after setting it up
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzDfs7_90-ses_2cNxUfrOFzucSTNZd6DrSMSgnQdfetqnMxcnSyL0y1WHs0Kcgc-m4/exec";

const STUDY_ID = "appearance";

// How many trials each participant sees (picked randomly from all available)
// Set to Infinity to show all trials
const TRIALS_PER_PARTICIPANT = 8;

// ── STATE ─────────────────────────────────────────────────────────────────
let trials = [];
let trialIndex = 0;
let currentTrial = null;
let currentUsername = sessionStorage.getItem(`username_${STUDY_ID}`);

// ── USERNAME MODAL ────────────────────────────────────────────────────────
if (currentUsername) {
  hideModal();
  initStudy();
} else {
  document.getElementById('username-modal').style.display = 'flex';
}

document.getElementById('username-submit').addEventListener('click', submitUsername);
document.getElementById('username-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') submitUsername();
});

function submitUsername() {
  const input = document.getElementById('username-input');
  const errorDiv = document.getElementById('username-error');
  const username = input.value.trim();
  if (!username) {
    errorDiv.textContent = 'Please enter a name to continue.';
    return;
  }
  sessionStorage.setItem(`username_${STUDY_ID}`, username);
  currentUsername = username;
  document.getElementById('display-username').textContent = username;
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
    const res = await fetch('./trials.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const allTrials = await res.json();

    // shuffle all trials, then take a subset for this participant
    const shuffled = [...allTrials].sort(() => Math.random() - 0.5);
    trials = shuffled.slice(0, Math.min(TRIALS_PER_PARTICIPANT, shuffled.length));
    trialIndex = 0;
    loadNextTrial();
  } catch (err) {
    console.error('Failed to load trials.json:', err);
    showMessage('Could not load study trials. Please refresh the page.', true);
  }
}

// ── LOAD TRIAL ────────────────────────────────────────────────────────────
function loadNextTrial() {
  if (trialIndex >= trials.length) {
    showCompletion();
    return;
  }

  currentTrial = trials[trialIndex];
  trialIndex++;

  updateProgress();
  populateTrial(currentTrial);
}

function populateTrial(trial) {
  // prompt
  document.getElementById('prompt-box').textContent = trial.prompt || '—';

  // reference images + labels
  document.getElementById('ref-a-img').src = trial.ref_a;
  document.getElementById('ref-b-img').src = trial.ref_b;
  document.getElementById('ref-a-label').textContent = `Reference A: ${trial.ref_a_label}`;
  document.getElementById('ref-b-label').textContent = `Reference B: ${trial.ref_b_label}`;

  // update Q1 and Q2 text with the part labels
  document.getElementById('q1-part').textContent = trial.ref_a_label;
  document.getElementById('q2-part').textContent = trial.ref_b_label;

  // method output images
  fillOutputs('imgs-a', trial.outputs_a);
  fillOutputs('imgs-b', trial.outputs_b);

  // hidden tracking fields
  setSpan('scene',          trial.scene_id);
  setSpan('model_a_method', trial.mapping.A);
  setSpan('model_b_method', trial.mapping.B);

  // reset form state
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
  urls.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = containerId === 'imgs-a' ? 'Sample A' : 'Sample B';
    img.className = 'model-image';
    // lazy-load for performance
    img.loading = 'lazy';
    container.appendChild(img);
  });
}

function setSpan(id, value) {
  const el = document.getElementById(id);
  el.textContent = value;
  // also set value attribute so we can read it on submit
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

  // collect answers
  const answers = {};
  let allAnswered = true;
  document.querySelectorAll('#survey-form .question').forEach((qDiv, idx) => {
    const name = `q${idx + 1}`;
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
    answers,
    timestamp:     new Date().toISOString(),
  };

  try {
    // mode: 'no-cors' is required for Apps Script — we can't read the response
    // body, but the POST goes through and the data is saved
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode:   'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify(payload),
    });
    // small delay so it doesn't feel instant
    await new Promise(r => setTimeout(r, 300));
    loadNextTrial();
  } catch (err) {
    console.error('Submit error:', err);
    showMessage('Error saving response — please check your connection and try again.', true);
    btn.disabled = false;
    btn.textContent = 'Submit & Next →';
  }
});

// ── COMPLETION ────────────────────────────────────────────────────────────
function showCompletion() {
  // fill the progress bar to 100%
  document.getElementById('progress-fill').style.width = '100%';
  document.getElementById('progress-text').textContent =
    `${trials.length} of ${trials.length} — Complete`;

  // hide study content
  document.querySelector('.task-card').style.display = 'none';
  document.querySelector('.references-section').style.display = 'none';
  document.querySelector('.outputs-section').style.display = 'none';
  document.querySelector('.survey-section').style.display = 'none';

  // show completion message
  const completionHtml = `
    <div class="completion-card">
      <div class="completion-emoji">🎉</div>
      <div class="completion-title">Study complete!</div>
      <div class="completion-text">
        Thank you for participating, <strong>${currentUsername}</strong>.<br>
        Your responses have been saved. You can now close this tab.
      </div>
    </div>
  `;
  document.querySelector('.page').insertAdjacentHTML('beforeend', completionHtml);
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function showMessage(msg, isError = false) {
  const box = document.getElementById('message');
  box.className = 'message ' + (isError ? 'error' : 'success');
  box.textContent = msg;
  box.style.display = 'block';
}
