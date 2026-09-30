const BLOCKED = /^(chrome|edge|about|devtools|chrome-extension|chrome-untrusted|view-source):/i;
const WEB_STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;
const popouts = new Map();

const PDF = /\.pdf([?#]|$)/i;

function inspectable(tab) {
  return Boolean(tab?.id) && !BLOCKED.test(tab.url || '') && !WEB_STORE.test(tab.url || '');
}

async function pickFromPdf(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const key = `shot:${Date.now()}`;
    await chrome.storage.local.set({ [key]: { dataUrl, title: tab.title, url: tab.url } });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`picker/picker.html?shot=${key}`),
      index: tab.index + 1,
      openerTabId: tab.id
    });
  } catch (error) {
    await flash(tab.id, '!');
  }
}

async function clearShots() {
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith('shot:'));
  if (keys.length) await chrome.storage.local.remove(keys);
}

async function flash(tabId, text) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ed1941' });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2000);
}

async function toggle(tab) {
  if (tab?.id && PDF.test(tab.url || '')) {
    await pickFromPdf(tab);
    return;
  }

  if (!inspectable(tab)) {
    if (tab?.id) await flash(tab.id, '—');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'layout-ruler/toggle' });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content/inspector.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'layout-ruler/toggle' });
    } catch (injectionError) {
      await flash(tab.id, '!');
    }
  }
}

async function openPopout(tabId) {
  const existing = popouts.get(tabId);
  if (existing !== undefined) {
    try {
      await chrome.windows.update(existing, { focused: true });
      return;
    } catch (error) {
      popouts.delete(tabId);
    }
  }

  const window = await chrome.windows.create({
    url: chrome.runtime.getURL(`panel/panel.html?tab=${tabId}`),
    type: 'popup',
    width: 400,
    height: 680
  });
  popouts.set(tabId, window.id);
}

async function closePopout(tabId) {
  const windowId = popouts.get(tabId);
  popouts.delete(tabId);
  if (windowId === undefined) return;
  try {
    await chrome.windows.remove(windowId);
  } catch (error) {
    /* already gone */
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggle(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-inspector') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggle(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [tabId, id] of popouts) {
    if (id !== windowId) continue;
    popouts.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type: 'layout-ruler/popin' }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => closePopout(tabId));

chrome.runtime.onStartup.addListener(clearShots);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;

  if (type === 'layout-ruler/capture') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  if (type === 'layout-ruler/popout' && sender.tab?.id) {
    openPopout(sender.tab.id);
    return false;
  }

  if (type === 'layout-ruler/popout-close' && sender.tab?.id) {
    closePopout(sender.tab.id);
    return false;
  }

  if ((type === 'layout-ruler/state' || type === 'layout-ruler/clip') && sender.tab?.id) {
    chrome.runtime.sendMessage({ ...message, tabId: sender.tab.id }).catch(() => {});
    return false;
  }

  if (type === 'layout-ruler/command' && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, { type: 'layout-ruler/command', action: message.action, index: message.index, value: message.value, remote: message.remote })
      .catch(() => {});
    return false;
  }

  return false;
});
