// Mock Helper - Content Script
// 运行在 MAIN world，可以直接访问页面的 window 对象

(function() {
  'use strict';

  const STORAGE_KEY = 'mock_helper_rules';
  let mockRules = {};
  let mockEnabled = true;

  // 从 localStorage 读取规则（MAIN world 无法访问 chrome.storage）
  function loadRules() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        mockRules = parsed.rules || {};
        mockEnabled = parsed.enabled !== false;
      }
    } catch (e) {
      console.warn('[Mock Helper] 读取规则失败:', e);
    }
  }

  // 监听 storage 变化，实时更新规则
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      loadRules();
      console.log('[Mock Helper] 规则已更新');
    }
  });

  // URL 匹配：支持通配符 * 和精确匹配
  function matchUrl(pattern, url) {
    try {
      // 提取路径部分用于匹配
      let pathname = url;
      
      // 如果是完整 URL，提取 pathname
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlObj = new URL(url);
        pathname = urlObj.pathname + urlObj.search;
      }
      
      // 精确匹配
      if (pattern === url || pattern === pathname) {
        return true;
      }
      
      // 通配符匹配：把 * 转成正则
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
        .replace(/\*/g, '.*');                    // * 转成 .*
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url) || regex.test(pathname);
    } catch (e) {
      console.warn('[Mock Helper] URL 匹配错误:', e);
      return false;
    }
  }

  // 查找匹配的 mock 规则
  function findMockRule(url) {
    if (!mockEnabled) return null;
    
    for (const [pattern, rule] of Object.entries(mockRules)) {
      if (rule.enabled !== false && matchUrl(pattern, url)) {
        console.log(`[Mock Helper] 命中规则: ${pattern}`);
        return rule;
      }
    }
    return null;
  }

  // 创建 mock Response
  function createMockResponse(rule) {
    const body = typeof rule.response === 'string' 
      ? rule.response 
      : JSON.stringify(rule.response);
    
    return new Response(body, {
      status: rule.status || 200,
      statusText: rule.statusText || 'OK',
      headers: {
        'Content-Type': rule.contentType || 'application/json',
        'X-Mock-Helper': 'true',
        ...rule.headers
      }
    });
  }

  // 延迟执行
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 劫持 Fetch ==========
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const rule = findMockRule(url);
    
    if (rule) {
      if (rule.delay) {
        await delay(rule.delay);
      }
      return createMockResponse(rule);
    }
    
    return originalFetch.call(window, input, init);
  };

  // ========== 劫持 XMLHttpRequest ==========
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._mockUrl = url;
    this._mockMethod = method;
    return originalXHROpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const rule = findMockRule(this._mockUrl);
    
    if (rule) {
      const xhr = this;
      const responseText = typeof rule.response === 'string'
        ? rule.response
        : JSON.stringify(rule.response);
      
      const doMock = () => {
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
        Object.defineProperty(xhr, 'status', { value: rule.status || 200, writable: false });
        Object.defineProperty(xhr, 'statusText', { value: rule.statusText || 'OK', writable: false });
        Object.defineProperty(xhr, 'responseText', { value: responseText, writable: false });
        Object.defineProperty(xhr, 'response', { value: responseText, writable: false });
        
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
      };
      
      if (rule.delay) {
        setTimeout(doMock, rule.delay);
      } else {
        setTimeout(doMock, 0);
      }
      return;
    }
    
    return originalXHRSend.call(this, body);
  };

  // 初始化
  loadRules();
  console.log('[Mock Helper] 已启动');

  // 暴露给页面的 API（方便调试）
  window.__mockHelper = {
    getRules: () => mockRules,
    isEnabled: () => mockEnabled,
    reload: loadRules
  };
})();
