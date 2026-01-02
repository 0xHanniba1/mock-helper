// Mock Helper - Background Service Worker

// 安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 选中文本时显示的菜单
  chrome.contextMenus.create({
    id: 'mock-helper-selection',
    title: 'Mock 此接口: "%s"',
    contexts: ['selection']
  });
  
  // 链接上右键显示的菜单
  chrome.contextMenus.create({
    id: 'mock-helper-link',
    title: 'Mock 此链接',
    contexts: ['link']
  });
  
  // 初始化存储
  chrome.storage.local.get(['mockEnabled'], (result) => {
    if (result.mockEnabled === undefined) {
      chrome.storage.local.set({ mockEnabled: true });
    }
  });
});

// 右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let targetUrl = '';
  
  if (info.menuItemId === 'mock-helper-selection' && info.selectionText) {
    // 选中的文本作为 URL
    targetUrl = info.selectionText.trim();
  } else if (info.menuItemId === 'mock-helper-link' && info.linkUrl) {
    // 链接 URL
    try {
      const urlObj = new URL(info.linkUrl);
      targetUrl = urlObj.pathname + urlObj.search;
    } catch {
      targetUrl = info.linkUrl;
    }
  }
  
  if (targetUrl) {
    // 存储待编辑的 URL，然后打开 popup
    await chrome.storage.local.set({ pendingMockUrl: targetUrl });
    
    // 通知用户打开弹窗
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
  }
});

// 处理来自 popup 或 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RULES') {
    chrome.storage.local.get(['mockRules', 'mockEnabled'], (result) => {
      sendResponse({
        rules: result.mockRules || {},
        enabled: result.mockEnabled !== false
      });
    });
    return true; // 保持消息通道开启
  }
  
  if (message.type === 'SAVE_RULES') {
    chrome.storage.local.set({ mockRules: message.rules }, () => {
      // 通知所有标签页更新规则
      syncRulesToAllTabs(message.rules, message.enabled);
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'SET_ENABLED') {
    chrome.storage.local.set({ mockEnabled: message.enabled }, () => {
      chrome.storage.local.get(['mockRules'], (result) => {
        syncRulesToAllTabs(result.mockRules || {}, message.enabled);
      });
      sendResponse({ success: true });
    });
    return true;
  }
});

// 同步规则到所有标签页的 localStorage
async function syncRulesToAllTabs(rules, enabled) {
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (rules, enabled) => {
            localStorage.setItem('mock_helper_rules', JSON.stringify({
              rules: rules,
              enabled: enabled
            }));
            // 触发 storage 事件让 content script 感知
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'mock_helper_rules'
            }));
          },
          args: [rules, enabled],
          world: 'MAIN'
        });
      } catch (e) {
        // 某些页面可能无法注入脚本，忽略错误
      }
    }
  }
}

// 同步规则到单个标签页
async function syncRulesToTab(tabId) {
  const result = await chrome.storage.local.get(['mockRules', 'mockEnabled']);
  const rules = result.mockRules || {};
  const enabled = result.mockEnabled !== false;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (rules, enabled) => {
        localStorage.setItem('mock_helper_rules', JSON.stringify({
          rules: rules,
          enabled: enabled
        }));
        if (window.__mockHelper) {
          window.__mockHelper.reload();
        }
      },
      args: [rules, enabled],
      world: 'MAIN'
    });
  } catch (e) {
    // 忽略错误
  }
}

// 监听标签页更新，页面加载完成时同步规则
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    syncRulesToTab(tabId);
  }
});
