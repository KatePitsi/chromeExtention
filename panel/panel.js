const { render, bind, keyAction } = globalThis.LayoutRulerPanel;

const tabId = Number(new URLSearchParams(location.search).get('tab'));
const panelNode = document.getElementById('panel');
let latest = null;

function command(action, index, value) {
  chrome.runtime.sendMessage({ type: 'layout-ruler/command', tabId, action, index, value, remote: true }).catch(() => {});
}

function flash(message) {
  const note = document.getElementById('note');
  note.textContent = message;
  note.classList.add('note--visible');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => note.classList.remove('note--visible'), 1600);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function storeDesign(file) {
  const key = latest?.design?.key;
  if (!key) return;
  try {
    await chrome.storage.local.set({ [`design-image:${key}`]: await readAsDataUrl(file) });
    command('design-reload');
    flash('Design image saved');
  } catch (error) {
    flash('Could not save the image');
  }
}

bind(panelNode, (action, index, value) => {
  if (action === 'design-file') storeDesign(value);
  else command(action, index, value);
});

document.addEventListener('keydown', (event) => {
  const action = keyAction(event);
  if (!action) return;
  command(action);
  event.preventDefault();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.tabId !== tabId) return;
  if (message.type === 'layout-ruler/state') {
    latest = message.payload;
    render(panelNode, latest, { mode: 'window', level: 1 });
  }
  if (message.type === 'layout-ruler/clip') {
    navigator.clipboard.writeText(message.text)
      .then(() => flash(message.label))
      .catch(() => flash('Copy failed'));
  }
});

command('ping');
