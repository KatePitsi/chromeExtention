const BLOCKED = /^(chrome|edge|about|devtools|chrome-extension|chrome-untrusted|view-source):/i;
const WEB_STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;
const CONTENT_FILES = ['panel/render.js', 'content/inspector.js'];

const PDF = /\.pdf([?#]|$)/i;

function inspectable(tab) {
  return Boolean(tab?.id) && !BLOCKED.test(tab.url || '') && !WEB_STORE.test(tab.url || '');
}

async function frameStack(tabId) {
  const key = `frames:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  return stored[key] || [0];
}

async function setFrameStack(tabId, stack) {
  const key = `frames:${tabId}`;
  if (stack.length <= 1) await chrome.storage.session.remove(key);
  else await chrome.storage.session.set({ [key]: stack });
}

async function activeFrame(tabId) {
  const stack = await frameStack(tabId);
  return stack[stack.length - 1];
}

function sendToFrame(tabId, frameId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function sendToActive(tabId, message) {
  return sendToFrame(tabId, await activeFrame(tabId), message);
}

const activeKey = (tabId) => `active:${tabId}`;

async function setTabActive(tabId, active) {
  if (active) await chrome.storage.session.set({ [activeKey(tabId)]: true });
  else await chrome.storage.session.remove(activeKey(tabId));
}

async function isTabActive(tabId) {
  const stored = await chrome.storage.session.get(activeKey(tabId));
  return Boolean(stored[activeKey(tabId)]);
}

async function pickFromPdf(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const key = `shot:${Date.now()}`;
    await chrome.storage.local.set({ [key]: { dataUrl, title: tab.title, url: tab.url } });
    const picker = await chrome.tabs.create({
      url: chrome.runtime.getURL(`picker/picker.html?shot=${key}`),
      index: tab.index + 1,
      openerTabId: tab.id
    });
    await chrome.storage.session.set({ [`picker:${picker.id}`]: key });
  } catch (error) {
    await flash(tab.id, '!');
  }
}

async function clearShots() {
  const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith('shot:'));
  if (keys.length) await chrome.storage.local.remove(keys);
}

async function forgetTab(tabId) {
  const pickerKey = `picker:${tabId}`;
  const stored = await chrome.storage.session.get(pickerKey);
  if (stored[pickerKey]) await chrome.storage.local.remove(stored[pickerKey]);
  await chrome.storage.session.remove([pickerKey, `frames:${tabId}`, activeKey(tabId)]);
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

  const frameId = await activeFrame(tab.id);
  const message = { type: 'layout-ruler/toggle' };
  let response;
  try {
    response = await sendToFrame(tab.id, frameId, message);
  } catch (error) {
    try {
      await setFrameStack(tab.id, [0]);
      await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: CONTENT_FILES });
      response = await sendToFrame(tab.id, 0, message);
    } catch (injectionError) {
      await flash(tab.id, '!');
      return;
    }
  }
  await setTabActive(tab.id, Boolean(response?.active));
  if (response && !response.active && frameId !== 0) await setFrameStack(tab.id, [0]);
}

async function prepareFrames(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
  } catch (error) {
    /* frames the extension can't reach are skipped */
  }
}

async function claimFrame(tabId, parentFrameId, childFrameId) {
  const stack = await frameStack(tabId);
  if (stack[stack.length - 1] !== parentFrameId) return;
  await setFrameStack(tabId, stack.concat(childFrameId));
  await sendToFrame(tabId, parentFrameId, { type: 'layout-ruler/suspend' }).catch(() => {});
}

async function exitFrame(tabId, frameId) {
  const stack = await frameStack(tabId);
  if (stack.length <= 1 || stack[stack.length - 1] !== frameId) return;
  stack.pop();
  await setFrameStack(tabId, stack);
  await sendToFrame(tabId, stack[stack.length - 1], { type: 'layout-ruler/resume' }).catch(() => setFrameStack(tabId, [0]));
}

async function popouts() {
  const stored = await chrome.storage.session.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith('popout:'))
    .map(([key, windowId]) => [Number(key.slice(7)), windowId]);
}

async function openPopout(tabId) {
  const key = `popout:${tabId}`;
  const existing = (await chrome.storage.session.get(key))[key];
  if (existing !== undefined) {
    try {
      await chrome.windows.update(existing, { focused: true });
      return;
    } catch (error) {
      await chrome.storage.session.remove(key);
    }
  }

  const window = await chrome.windows.create({
    url: chrome.runtime.getURL(`panel/panel.html?tab=${tabId}`),
    type: 'popup',
    width: 400,
    height: 720
  });
  await chrome.storage.session.set({ [key]: window.id });
}

async function closePopout(tabId) {
  const key = `popout:${tabId}`;
  const windowId = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.remove(key);
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

chrome.windows.onRemoved.addListener(async (windowId) => {
  for (const [tabId, id] of await popouts()) {
    if (id !== windowId) continue;
    await chrome.storage.session.remove(`popout:${tabId}`);
    sendToActive(tabId, { type: 'layout-ruler/popin' }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  closePopout(tabId);
  forgetTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') setFrameStack(tabId, [0]);
});

chrome.runtime.onStartup.addListener(clearShots);
chrome.runtime.onInstalled.addListener(clearShots);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  const tabId = sender.tab?.id;

  if (type === 'layout-ruler/capture') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  if (type === 'layout-ruler/popout' && tabId) {
    openPopout(tabId);
    return false;
  }

  if (type === 'layout-ruler/popout-close' && tabId) {
    closePopout(tabId);
    return false;
  }

  if (type === 'layout-ruler/prepare-frames' && tabId) {
    prepareFrames(tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === 'layout-ruler/claim' && tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'layout-ruler/claim', token: message.token, parentFrameId: sender.frameId }).catch(() => {});
    return false;
  }

  if (type === 'layout-ruler/claimed' && tabId) {
    claimFrame(tabId, message.parentFrameId, sender.frameId);
    return false;
  }

  if (type === 'layout-ruler/restore' && tabId) {
    isTabActive(tabId).then((active) => sendResponse({ active }));
    return true;
  }

  if (type === 'layout-ruler/closed' && tabId) {
    setFrameStack(tabId, [0]);
    setTabActive(tabId, false);
    return false;
  }

  if (type === 'layout-ruler/exit-frame' && tabId) {
    exitFrame(tabId, sender.frameId);
    return false;
  }

  if ((type === 'layout-ruler/state' || type === 'layout-ruler/clip') && tabId) {
    chrome.runtime.sendMessage({ ...message, tabId }).catch(() => {});
    return false;
  }

  if (type === 'layout-ruler/command' && message.tabId) {
    const { action, index, value, remote } = message;
    sendToActive(message.tabId, { type: 'layout-ruler/command', action, index, value, remote }).catch(() => {});
    return false;
  }

  return false;
});
