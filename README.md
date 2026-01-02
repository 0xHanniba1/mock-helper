# Mock Helper

轻量级 API Mock 助手 - Chrome 扩展

## 功能

- ✅ 劫持 `fetch` 和 `XMLHttpRequest` 请求
- ✅ 支持 URL 通配符匹配（如 `/api/user/*`）
- ✅ 自定义响应状态码、延迟时间
- ✅ 全局开关，一键启用/禁用
- ✅ 实时生效，无需刷新页面

## 安装方法

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `mock-helper` 文件夹

## 使用方法

### 添加 Mock 规则

1. 点击浏览器工具栏的扩展图标
2. 点击「+ 添加 Mock 规则」
3. 填写 URL 匹配规则和响应内容
4. 保存即可生效

### URL 匹配规则

```
/api/user/info     # 精确匹配
/api/user/*        # 通配符匹配
/api/order/*/detail  # 中间通配符
```

### 响应配置

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "name": "Mock User"
  }
}
```

## 调试

在控制台输入以下命令查看 Mock 状态：

```javascript
window.__mockHelper.getRules()    // 查看当前规则
window.__mockHelper.isEnabled()   // 查看是否启用
window.__mockHelper.reload()      // 重新加载规则
```

## 文件结构

```
mock-helper/
├── manifest.json    # 扩展配置
├── background.js    # 后台服务
├── content.js       # 内容脚本（fetch 劫持）
├── popup.html       # 弹窗界面
├── popup.js         # 弹窗逻辑
└── icons/           # 图标
```

## 技术要点

- 使用 MV3 的 `world: "MAIN"` 特性，直接在页面上下文中运行
- 通过 `localStorage` 在 MAIN world 和扩展之间同步数据
- 支持 fetch 和 XHR 双重劫持

## License

MIT
