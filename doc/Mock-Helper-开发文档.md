# Mock Helper 开发文档

> 记录项目开发历程、技术决策、问题解决方案

## 📁 项目结构

```
mock-helper/
├── manifest.json      # 扩展配置文件 (Manifest V3)
├── background.js      # 后台服务 Service Worker
├── content.js         # 内容脚本 (运行在 MAIN world)
├── popup.html         # 弹窗界面
├── popup.js           # 弹窗交互逻辑
├── icons/             # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # 使用文档
```

---

## 🏗️ 技术架构

### 核心设计

```
┌─────────────────────────────────────────────────────────┐
│                      Chrome 扩展                         │
├─────────────────────────────────────────────────────────┤
│  popup.js                                               │
│  ├── 用户界面交互                                        │
│  ├── 规则 CRUD 操作                                      │
│  └── 通过 chrome.runtime.sendMessage 与 background 通信  │
├─────────────────────────────────────────────────────────┤
│  background.js (Service Worker)                         │
│  ├── 管理 chrome.storage 中的规则                        │
│  ├── 右键菜单处理                                        │
│  ├── 监听标签页更新事件                                   │
│  └── 通过 chrome.scripting.executeScript 同步规则到页面  │
├─────────────────────────────────────────────────────────┤
│  content.js (MAIN world)                                │
│  ├── 劫持 window.fetch                                  │
│  ├── 劫持 XMLHttpRequest                                │
│  ├── 从 localStorage 读取规则                           │
│  └── 暴露 window.__mockHelper 调试 API                  │
└─────────────────────────────────────────────────────────┘
```

### 关键技术点

#### 1. Manifest V3 的 world: "MAIN"

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "world": "MAIN",        // 关键！运行在页面上下文
    "run_at": "document_start"
  }
]
```

- **MAIN world** 允许 content script 直接访问页面的 `window` 对象
- 这样才能劫持 `window.fetch` 和 `XMLHttpRequest.prototype`
- 缺点：无法访问 `chrome.*` API，需要通过 `localStorage` 桥接

#### 2. 数据同步方案

由于 MAIN world 的 content script 无法访问 `chrome.storage`，采用以下方案：

```
chrome.storage.local ←→ background.js ←→ localStorage ←→ content.js
```

同步流程：
1. popup 保存规则到 `chrome.storage.local`
2. background 监听到变化，遍历所有标签页
3. 通过 `chrome.scripting.executeScript` 写入每个页面的 `localStorage`
4. content.js 监听 `storage` 事件，重新加载规则

#### 3. Fetch 劫持

```javascript
const originalFetch = window.fetch;
window.fetch = async function(input, init) {
  const url = typeof input === 'string' ? input : input.url;
  const rule = findMockRule(url);
  
  if (rule) {
    if (rule.delay) await delay(rule.delay);
    return createMockResponse(rule);
  }
  
  return originalFetch.call(window, input, init);
};
```

#### 4. XHR 劫持

```javascript
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._mockUrl = url;  // 保存 URL 供 send 时使用
  return originalXHROpen.call(this, method, url, ...args);
};

XMLHttpRequest.prototype.send = function(body) {
  const rule = findMockRule(this._mockUrl);
  if (rule) {
    // 模拟响应...
    return;
  }
  return originalXHRSend.call(this, body);
};
```

---

## 📝 版本更新日志

### v1.1.0 (2026-01-02)

#### 问题 1：编辑/删除按钮点击无效

**现象**：弹窗中的编辑和删除按钮点击没有任何反应

**原因**：Chrome 扩展的 CSP（内容安全策略）禁止内联事件处理器（onclick）

**错误代码**：
```html
<button onclick="editRule('${url}')">编辑</button>
```

**修复方案**：使用 `addEventListener` 绑定事件
```javascript
rulesList.querySelectorAll('[data-action="edit"]').forEach(btn => {
  btn.addEventListener('click', () => editRule(btn.dataset.url));
});
```

---

#### 问题 2：规则不同步到页面

**现象**：在弹窗中添加规则后，页面的 `window.__mockHelper.getRules()` 返回空对象

**原因**：
1. 添加规则时，目标页面可能还没打开
2. 页面打开后，没有主动获取最新规则

**修复方案**：监听标签页更新事件，页面加载完成时主动推送规则
```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    syncRulesToTab(tabId);
  }
});
```

---

#### 问题 3：URL 匹配失败

**现象**：规则 `/api/user/info` 无法匹配 fetch 请求的 `/api/user/info`

**原因**：`new URL('/api/user/info')` 对相对路径会抛出异常，导致 `matchUrl` 函数返回 false

**错误代码**：
```javascript
function matchUrl(pattern, url) {
  const urlObj = new URL(url);  // 相对路径会报错！
  // ...
}
```

**修复方案**：先判断是否为完整 URL
```javascript
function matchUrl(pattern, url) {
  let pathname = url;
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const urlObj = new URL(url);
    pathname = urlObj.pathname + urlObj.search;
  }
  // ...
}
```

---

#### 问题 4：开关状态不明显

**现象**：用户无法分辨开关是开启还是关闭状态

**原因**：开关颜色在紫色背景上区分度不够

**修复方案**：
1. 开启状态改为绿色 `#4CAF50`
2. 关闭状态改为灰色 `#ccc`
3. 增加 ON/OFF 文字标识

---

#### 功能：右键菜单快捷添加

**需求**：用户希望能快速添加规则，而不是手动输入 URL

**实现方案**：
1. 创建两种右键菜单：选中文本、链接
2. 点击菜单后，将 URL 存入 `chrome.storage.local.pendingMockUrl`
3. 设置 badge 提示用户
4. 打开弹窗时检查 `pendingMockUrl`，自动填充并打开编辑框

```javascript
chrome.contextMenus.create({
  id: 'mock-helper-selection',
  title: 'Mock 此接口: "%s"',
  contexts: ['selection']
});
```

---

### v1.0.0 (2026-01-02)

#### 初始版本功能

- **fetch 劫持**：拦截 `window.fetch` 请求
- **XHR 劫持**：拦截 `XMLHttpRequest` 请求
- **URL 匹配**：支持精确匹配和通配符 `*`
- **响应自定义**：状态码、延迟、响应体
- **弹窗管理**：规则的增删改查
- **全局开关**：一键启用/禁用

---

## 🔮 待开发功能

### 优先级 P0

- [ ] 单条规则启用/禁用开关
- [ ] 规则导入/导出（JSON 格式）

### 优先级 P1

- [ ] 请求日志面板（显示哪些请求被 Mock）
- [ ] 正则表达式匹配
- [ ] 请求方法过滤（GET/POST/PUT/DELETE）

### 优先级 P2

- [ ] 响应 Header 自定义
- [ ] DevTools Panel 集成
- [ ] 规则分组管理
- [ ] 云端同步

---

## 🧪 测试方法

### 手动测试

1. 打开任意 HTTPS 网站（如 https://www.baidu.com）
2. 打开控制台，检查插件是否加载：
   ```javascript
   window.__mockHelper  // 应返回对象
   ```
3. 添加规则后测试：
   ```javascript
   fetch('/api/test').then(r => r.json()).then(console.log)
   ```

### 测试页面

项目包含 `mock-test.html` 测试页面，需通过 HTTP 服务器访问：
```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/mock-test.html
```

---

## 📚 参考资料

- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts - world: MAIN](https://developer.chrome.com/docs/extensions/mv3/content_scripts/#isolated_world)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/scripting/)
- [chrome.contextMenus API](https://developer.chrome.com/docs/extensions/reference/contextMenus/)
