# ⚡ Application Form Assistant · 网申智能自动填表助手

<p align="center">
  <b>告别春招秋招重复机械填表！专为求职者打造的浏览器智能填表扩展</b><br>
  深度识别北森 / Moka / 大易 / 智联等主流招聘系统 · 基于本地离线资料库一键秒级填入 · 100% 本地存储绝不上传隐私
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20MV3-4CAF50?logo=googlechrome&logoColor=white" alt="Chrome Edge" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20本地存储不外泄-brightgreen" alt="Privacy" />
  <img src="https://img.shields.io/badge/Safety-永不自动提交-red" alt="Safety" />
  <img src="https://img.shields.io/badge/Tech-React%20%2B%20TypeScript-3178C6" alt="Tech" />
  <img src="https://img.shields.io/badge/AI%20Agent-MCP%20Ready-orange.svg" alt="MCP" />
</p>

<p align="center">
  <b>简体中文</b> | <a href="./README.en.md">English Documentation</a>
</p>

---

## ⚡ 为什么开发这款插件？

每年春招、秋招或跳槽季，求职者最痛苦的莫过于：
- **每投递一家公司，都要在新网站里把基本信息、教育背景、项目经历、实习细节从头手打一遍**；
- 北森（Beisen）、Moka、大易（Dayi）、用友、飞书招聘等系统表单格式千奇百怪，浏览器的普通密码填充器根本无法匹配这些复杂的下拉联动、日期选择器和动态卡片；
- 市面上的在线求职代投插件，往往需要你把**身份证号、手机号、家庭住址、详细简历全部上传到云端服务器**，极其容易导致个人敏感信息遭泄露或倒卖。

**网申自动填表助手就是为了彻底解决这一痛点而诞生！**  
它是一个轻量的 Chrome / Edge（Manifest V3）浏览器扩展，**所有个人档案与匹配计算 100% 运行在你的本地浏览器中**，识别表单后一键自动填入，由你人工最终核对点击提交！

---

## 🛡️ 严苛的安全红线（这是产品定义，绝不动摇）

求职安全重于泰山，本扩展在架构与代码层设置了不可逾越的安全红线：

| 安全红线 | 为什么必须这样做 | 代码与测试保障 |
| :--- | :--- | :--- |
| **永不自动点击提交** | 扩展只负责辅助快速填表，**人工必须拥有最终审核与点击提交的决定权** | `src/rules/ignoreRules.ts` + E2E 强制断言 |
| **高危法律字段坚决不代填** | 承诺、背调授权、声明、电子签名、是否服从调剂等法律与责任选项一律留给人工判断 | `src/rules/riskRules.ts` |
| **绝不凭空编造虚假值** | 本地资料库中没有的信息宁可留空，绝不胡乱猜测，拒绝简历造假 | `deriveStatus` 严格门禁 |
| **100% 本地纯离线** | 没有云端后端服务器，没有隐私埋点，简历数据仅存在本地 `chrome.storage.local` | 零第三方网络外发 |

---

## ✨ 核心特性

- 🎯 **一键流水线极速填充**：进入网申页面后，侧边栏点击「开始识别」，自动完成「页面连接 → 岗位识别 → 动态表单解析 → 语义匹配 → 一键安全写入」。
- 🧠 **精准语义识别**：无论表单字段叫「手机」、「联系电话」、「Phone」还是「联系方式」，均能精准识别匹配。
- 📑 **多套资料库自由切换**：支持保存「产品岗」、「技术岗」、「运营岗」等不同版本的专属经历，根据投递岗位一键选用匹配资料。
- 🧩 **动态表单与复杂组件适配**：全面兼容 SPA 单页应用动态加载的日期范围控件、联级省市下拉框、多选框与富文本框。
- 🧾 **清晰透明的填写回执**：每次填写完成后，明确告知哪些字段成功填入，哪些敏感字段交由你人工确认，一清二楚。

---

## 📥 3 步极速安装（Edge / Chrome 通用）

### 步骤 1：下载或获取扩展包
你可以直接下载打包好的扩展文件夹，或者通过源码一键生成：
```bash
git clone https://github.com/zhangtt08/job-application-autofill.git
cd job-application-autofill
npm install
npm run build
```
执行完成后，项目内将生成 `dist/` 文件夹。

### 步骤 2：加载到浏览器
1. 在 Edge 打开 `edge://extensions`（或在 Chrome 打开 `chrome://extensions`）；
2. 开启页面上的「**开发人员模式**」开关；
3. 点击「**加载解压缩的扩展程序**」，选择项目根目录下的 **`dist/`** 文件夹即可安装成功！

### 步骤 3：开始使用
1. 点击浏览器工具栏上的扩展图标，打开侧边栏；
2. 首次使用前往「**资料**」页，粘贴你的文本简历（完全本地解析）；
3. 打开任意校招网申或社招表单页面，在「**投递**」页点击「**开始识别并填写**」，见证奇迹！

---

## 🤖 开发者与 AI Agent 支持 (MCP)

本扩展同时提供独立的本地 Agent API 服务与 MCP 协议接口（端口 `8797`）：

```bash
# 启动本地 Agent HTTP 服务
npm run agent:serve

# 启动 MCP stdio 桥接（支持 Cursor / Claude Code 调用）
npm run agent:mcp
```

提供 `afa.scan_form`、`afa.plan_fill`、`afa.validate_profile` 等 8 个只读安全工具。

---

## ⭐ 支持与致谢

如果这款插件为你省去了繁琐枯燥的重复填表时间，帮你斩获了心仪的 Offer，请给项目点一个 **Star ⭐**！祝愿所有求职者投递顺利，早日上岸！

## 📄 开源许可证
本项目基于 [MIT License](LICENSE) 协议开源。
