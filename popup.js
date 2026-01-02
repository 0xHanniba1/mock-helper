// Mock Helper - Popup Script

let rules = {};
let enabled = true;
let editingUrl = null;

// DOM 元素
const globalToggle = document.getElementById('globalToggle');
const toggleLabel = document.getElementById('toggleLabel');
const rulesList = document.getElementById('rulesList');
const addRuleBtn = document.getElementById('addRuleBtn');
const editModal = document.getElementById('editModal');
const modalTitle = document.getElementById('modalTitle');
const ruleUrl = document.getElementById('ruleUrl');
const ruleStatus = document.getElementById('ruleStatus');
const ruleDelay = document.getElementById('ruleDelay');
const ruleResponse = document.getElementById('ruleResponse');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');

// 更新开关显示状态
function updateToggleLabel() {
  toggleLabel.textContent = globalToggle.checked ? 'ON' : 'OFF';
}

// 初始化
async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_RULES' });
  rules = response.rules || {};
  enabled = response.enabled !== false;
  
  globalToggle.checked = enabled;
  updateToggleLabel();
  renderRules();
  
  // 检查是否有从右键菜单传来的 URL
  const result = await chrome.storage.local.get(['pendingMockUrl']);
  if (result.pendingMockUrl) {
    // 清除待处理 URL
    await chrome.storage.local.remove(['pendingMockUrl']);
    // 清除 badge
    chrome.action.setBadgeText({ text: '' });
    
    // 打开编辑弹窗并预填充
    editingUrl = null;
    modalTitle.textContent = '添加规则';
    ruleUrl.value = result.pendingMockUrl;
    ruleStatus.value = '200';
    ruleDelay.value = '0';
    ruleResponse.value = '{\n  "code": 0,\n  "message": "success",\n  "data": {}\n}';
    editModal.classList.add('active');
    ruleResponse.focus();
  }
}

// 渲染规则列表
function renderRules() {
  const ruleKeys = Object.keys(rules);
  
  if (ruleKeys.length === 0) {
    rulesList.innerHTML = `
      <div class="empty-state">
        <div>📭</div>
        <p>还没有 Mock 规则<br>点击下方按钮添加</p>
      </div>
    `;
    return;
  }
  
  rulesList.innerHTML = ruleKeys.map((url, index) => {
    const rule = rules[url];
    const statusClass = rule.enabled !== false ? '✅ 启用' : '⏸️ 禁用';
    return `
      <div class="rule-item">
        <div class="rule-info">
          <div class="rule-url">${escapeHtml(url)}</div>
          <div class="rule-status">${statusClass} | ${rule.status || 200} | ${rule.delay || 0}ms</div>
        </div>
        <div class="rule-actions">
          <button class="btn btn-small btn-primary" data-action="edit" data-url="${escapeHtml(url)}">编辑</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-url="${escapeHtml(url)}">删除</button>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定事件
  rulesList.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => editRule(btn.dataset.url));
  });
  
  rulesList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteRule(btn.dataset.url));
  });
}

// HTML 转义
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// 全局开关
globalToggle.addEventListener('change', async () => {
  enabled = globalToggle.checked;
  updateToggleLabel();
  await chrome.runtime.sendMessage({ 
    type: 'SET_ENABLED', 
    enabled 
  });
});

// 添加规则
addRuleBtn.addEventListener('click', () => {
  editingUrl = null;
  modalTitle.textContent = '添加规则';
  ruleUrl.value = '';
  ruleStatus.value = '200';
  ruleDelay.value = '0';
  ruleResponse.value = '{\n  "code": 0,\n  "message": "success",\n  "data": {}\n}';
  editModal.classList.add('active');
  ruleUrl.focus();
});

// 编辑规则
function editRule(url) {
  const rule = rules[url];
  if (!rule) return;
  
  editingUrl = url;
  modalTitle.textContent = '编辑规则';
  ruleUrl.value = url;
  ruleStatus.value = rule.status || 200;
  ruleDelay.value = rule.delay || 0;
  ruleResponse.value = typeof rule.response === 'string' 
    ? rule.response 
    : JSON.stringify(rule.response, null, 2);
  editModal.classList.add('active');
}

// 删除规则
async function deleteRule(url) {
  if (!confirm(`确定删除规则: ${url}?`)) return;
  
  delete rules[url];
  await saveRules();
  renderRules();
}

// 取消编辑
cancelBtn.addEventListener('click', () => {
  editModal.classList.remove('active');
});

// 保存规则
saveBtn.addEventListener('click', async () => {
  const url = ruleUrl.value.trim();
  if (!url) {
    alert('请输入 URL 匹配规则');
    return;
  }
  
  let response;
  try {
    response = JSON.parse(ruleResponse.value);
  } catch (e) {
    // 如果不是有效 JSON，就当作字符串
    response = ruleResponse.value;
  }
  
  // 如果是编辑且 URL 变了，删除旧的
  if (editingUrl && editingUrl !== url) {
    delete rules[editingUrl];
  }
  
  rules[url] = {
    enabled: true,
    status: parseInt(ruleStatus.value) || 200,
    delay: parseInt(ruleDelay.value) || 0,
    response
  };
  
  await saveRules();
  renderRules();
  editModal.classList.remove('active');
});

// 保存到 storage
async function saveRules() {
  await chrome.runtime.sendMessage({ 
    type: 'SAVE_RULES', 
    rules,
    enabled
  });
}

// 点击模态框外部关闭
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    editModal.classList.remove('active');
  }
});

// 启动
init();
