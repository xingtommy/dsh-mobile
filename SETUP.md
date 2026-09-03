# dsh-mobile — 安装与使用指南

本仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 **overlay**，提供两块：

1. **手机端 UI（`ui-mobile`）**：移动设备（或窄视口）上以全屏页栈接管桌面框架 —— Home / Chat / Task-details / Settings，外加会话菜单（详情 · 模型 · 权限）与新建工作区目录浏览器。
2. **PIN 网关（`gateway/dsh-gateway.mjs`）**：公网反向代理，为手机访问加 PIN 鉴权 + gzip 压缩，配合 NPS 内网穿透。

## 两条线（按 harness 版本自动选择）

| 分支 / tag | 目标 harness | 客户端层 |
|---|---|---|
| `main`（`v1.0.0`） | `dsh-v0.1.1-rc.2` | 旧 `@deepseek-ai/dsh-client-runtime` |
| `v2` | `dsh-v0.1.2+`（alpha.3 / alpha.5） | 拆分的 client 层 |

仓库里同时带 `ui-mobile-v1/` 与 `ui-mobile-v2/`，`scripts/compat-patch.mjs` 会**按你 harness 的版本自动注入对应那套**，无需手动选。

---

## 安装

### 0. 前提
- 一个 `deepseek-harness` checkout（pnpm workspace，Node ≥ 20）。
- `pnpm`。
- （可选）`NPS` 客户端，用于公网 TCP 转发。

### 1. 拉取 overlay 仓库
```bash
git clone https://github.com/xingtommy/dsh-mobile.git
cd dsh-mobile

# 目标 harness 0.1.2+（alpha.3 / alpha.5 等）
git checkout v2
# 目标 harness 0.1.1 (rc.2) 则用 main
```

### 2. 一键注入到你的 harness（自动选 v1/v2）
```bash
node scripts/compat-patch.mjs <你的harness路径> .
# 例：node scripts/compat-patch.mjs ../deepseek-harness .
```
脚本会：
- 读 harness 根 `package.json` 的 `version`：`>= 0.1.2` → 注入 `ui-mobile-v2`；`0.1.1`（rc.2）→ 注入 `ui-mobile-v1`。
- 自动加 `tsconfig.client.json` 引用 + `web-app` bundle 依赖（`@deepseek-ai/dsh-client-ui-mobile`）。

### 3. 在 harness 里安装、构建、启动
```bash
cd <你的harness路径>
pnpm install
pnpm dsh web          # 重建 web 前端包并启动 → http://127.0.0.1:3080
```
浏览器打开后：**电脑默认桌面版；手机默认移动壳**（按设备 User-Agent 自动切换）。

### 4. 挂载插件（让 dsh 应用真正加载它）
在 `$DSH_HOME/cordis.patch.yml`（默认 `~/.dsh/cordis.patch.yml`，Windows 为 `C:\Users\<你>\.dsh\cordis.patch.yml`）里追加：
```yaml
- insert:
    - id: ui-mobile
      name: '@deepseek-ai/dsh-client-ui-mobile'
```
重启 `dsh web` 生效。

### 5.（可选）公网 / 手机访问 —— PIN 一步进
```bash
cd dsh-mobile
node scripts/start-web.mjs <你的harness路径> --pin <4-12位PIN>
# 例：node scripts/start-web.mjs ../deepseek-harness --pin 123456
```
`start-web.mjs` 会：
1. 启动 `pnpm dsh web`；
2. 抓取它启动时打印的 `?token=<launchToken>`；
3. 用该 token 启动 `gateway/dsh-gateway.mjs`（`127.0.0.1:3081` → `127.0.0.1:3080`）；
4. 打印公网 URL。

**NPS 隧道**把 `target_addr` 指向 `127.0.0.1:3081`，手机访问 `http://<公网IP>:3081` → **输入 PIN 一次即进移动壳**。

也可以手动起网关：
```bash
cd dsh-mobile/gateway
cp auth.example.json auth.json    # 改成你自己的 4-12 位 PIN
node dsh-gateway.mjs --listen 3081 --target 127.0.0.1:3080
```

---

## 界面切换

移动壳激活条件（满足其一）：
- 地址含 `#/mobile`；
- `window.__DSH_MOBILE__ === true`；
- **移动端 User-Agent**（`Android|iPhone|iPad|iPod|Mobile|Windows Phone|IEMobile|Opera Mini|BlackBerry|webOS`）。

即：**手机 UA → 移动壳；桌面 UA → 桌面版**（桌面窗口拉窄仍是桌面）。`#/mobile` 为手动强制移动。

---

## 主要功能
- **Home**：工作区筛选、会话列表、新建会话。
- **Chat**：消息流（用户/助理/工具卡/命令/提示）、流式 partial、运行中工具、加载更早；运行中发送即入**排队中**。
- **排队中 dock**：每行 编辑 / 删除 / **插话发送**（steer）；发送/插话**立即回显**，不等 agent 跑完。
- **Pending 交互**：ask-user 提问 / 工具授权，手机上可直接回答。
- **会话菜单**：详情、模型选择、权限切换（`/permission`）。
- **详情**：任务概览、工具调用、重命名、取消。
- **设置**：主题（浅/深/跟随系统）、语言（中/英）、关于、新建工作区（目录浏览）。
- **PIN 卡**：桌面 设置 → 插件 → 可配置，可改网关 PIN。

---

## 注意事项
1. **务必改 PIN**：`gateway/auth.json` 里的占位 `123456` 要改成你自己的（否则知道默认 PIN 的人能进）。
2. **alpha.5 的浏览器会话鉴权**：dsh web 自己在 alpha.3+ 加了会话鉴权（`launchToken` + `dsh-auth` cookie）。`start-web.mjs` 会**自动**用该 token 完成这一步（公网只需 PIN）。手动起网关时，若要"公网一步进"，给网关设 `DSH_GATEWAY_DSH_TOKEN=<dsh web 打印的 token>`。
3. **移动壳按设备（UA）决定**：手机一律移动壳。若希望"手机也能切回桌面版"，可再加一个开关（如 `?mobile=0`），本项目暂未内置。
4. 详细的 trustedHosts / 目录选择器 / 网关计划任务等内容见仓库 [INSTALL.md](INSTALL.md)。

---

## 仓库结构
```
dsh-mobile/
├── ui-mobile-v1/        v1 覆盖层（目标 dsh-v0.1.1-rc.2）
├── ui-mobile-v2/        v2 覆盖层（目标 dsh 0.1.2+）
├── gateway/             PIN 网关（dsh-gateway.mjs, auth.json, install-task.ps1）
├── scripts/
│   ├── compat-patch.mjs  按 harness 版本自动注入 v1/v2
│   └── start-web.mjs     一键启动 dsh web + 网关（PIN 一步进）
├── INSTALL.md          详细安装文档
└── README.md
```
