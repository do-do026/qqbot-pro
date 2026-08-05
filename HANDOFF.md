# qqbot-pro 冷启动接续文档（HANDOFF）

> 用途：新窗口 AI 接续本工程的唯一入口。读完本文件 + 三个链接，即可独立工作，无需初尘转述。
> 更新时间：2026-08-06 00:50
> 状态：M1 完成（v0.2.0），M2+ 待开工

---

## 0. 三十秒速览（先看这个）

**项目**：`qqbot-pro` —— Operit 的 QQ Bot 增强包（独立 ToolPkg，不修改原包 `com.operit.qqbot_bundle`）。
**仓库**：`https://github.com/do-do026/qqbot-pro`（公开，main 分支，GitHub 账号 do-do026）。
**进度**：M1 全绿（T01-T08 + T05 事件放开），共 2 个子包 11 个工具，已烧录进 Operit。
**当前版本**：`com.operit.qqbot_pro` v0.2.0。
**下一步**：新会话验证工具真实调用 → 然后 M2（SSRF + 分块）或 M3（官方流式）二选一，见第 5 节资源分配。

**必须读的三个文件**：
1. `ARCHITECTURE.md` —— 全量架构、任务拆分 T/W、里程碑 M0-M7、风险对策
2. `STATUS.md` —— 已完成/待验证/已知问题/技术债/backlog 的实时快照
3. `HANDOFF.md`（本文件）—— 冷启动上下文 + 踩坑记录 + 工作流程 + 资源清单

---

## 1. 项目文件地图

```
/sdcard/Download/qqbot-pro/          ← 主目录（GitHub 镜像）
├── ARCHITECTURE.md                  ← 架构与路线图（335行，必读）
├── STATUS.md                        ← 项目状态/技术债/backlog（必读）
├── HANDOFF.md                       ← 本文件（必读）
├── README.md                        ← 仓库门面
└── package/                         ← 包源码
    ├── manifest.json                ← ToolPkg 清单（toolpkg_id: com.operit.qqbot_pro）
    ├── resources/
    │   └── qqbot_pro_gateway.py     ← 增强版 Gateway（原包复制的增强版）
    ├── src/                         ← 源码（手写 JS，无 TS 编译）
    │   ├── main.js                  ← 入口（registerToolPkg）
    │   ├── shared/core.js           ← 共享核心：凭证/token/OpenAPI/buildSendBody
    │   └── packages/
    │       ├── qqbot_pro_basic.js   ← 子包1：撤回/Markdown/引用/输入态/查询（5工具）
    │       └── qqbot_pro_gateway.js ← 子包2：增强版Gateway管理（6工具）
    ├── dist/                        ← 与 src 相同（CommonJS 无需编译，手动 cp 同步）
    └── test/                        ← 冒烟测试脚本

/sdcard/Download/Operit/dev_package/qqbot_pro/  ← 开发烧录目录（与主目录需手动同步）
/sdcard/Android/data/com.ai.assistance.operit/files/packages/com.operit.qqbot_pro.toolpkg  ← 安装产物
```

---

## 2. 已完成（M1 全绿，v0.2.0）

**子包1 `qqbot_pro_basic`（5 工具）**：
- `qqbot_pro_recall` —— 撤回单聊/群聊消息（T01）
- `qqbot_pro_send` —— 发送：文本/Markdown/引用回复/输入中状态（T02+T06+T07）
- `qqbot_pro_group_info` —— 群信息查询（T03）
- `qqbot_pro_bot_state` —— 机器人群状态（T04）
- `qqbot_pro_me` —— 机器人资料（T08）

**子包2 `qqbot_pro_gateway`（6 工具）**：
- `qqbot_pro_gateway_start/stop/status` —— 增强版 Gateway 服务管理
- `qqbot_pro_receive_events` —— 事件队列读取（支持 scene/event_type 过滤）
- `qqbot_pro_clear_events` —— 清空事件队列
- `qqbot_pro_respond_interaction` —— PUT /interactions/{id} 回应按钮回调（T05）

**增强版 Gateway 关键改动**（对比原包）：
- 事件白名单全放开：INTERACTION_CREATE / GROUP_MEMBER_ADD / GROUP_ADD_ROBOT / FRIEND_DEL 等
- INTERACTION_CREATE 的 scene 识别（从 payload.d.scene / chat_type 判断 c2c/group/guild）
- 事件体新增 `interactionType` / `interactionData` 字段
- 独立控制端口 **32146**（原包是 32145，隔离不冲突）

**已验证**：Python 语法 ✅、JS 语法（node --check）✅、`debug_install_toolpkg` 烧录 ✅、11 工具注册 ✅、GitHub 同步 ✅。

---

## 3. 未完成（Backlog 全量）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M2 体验包 | SSRF 防护（附件 URL 校验）、Markdown 感知分块 | ⬜ 未开工 |
| M3 流式包 | W1.1-W1.4 官方流式消息（stream_messages 三态 + AI 衔接 + 错误处理） | ⬜ 未开工 |
| M4 交互包 | W2.1-W2.5 键盘按钮 + INTERACTION_CREATE 完整交互 | ⬜ 未开工（respond_interaction 已备好） |
| M5 媒体包 | W3.1-W3.4 分片上传、W4.1-W4.2 多类型富媒体（含图片发送移植） | ⬜ 未开工 |
| M6 架构包 | W5.1-W5.4 多账号、E1 Webhook 模式 | ⬜ 未开工 |
| E5 | 频道体系 | ❌ 明确不做 |

**原包未复用部分**（有意为之）：Gateway 收消息（原包承担）、自动回复桥（原包承担）、图片发送（归入 W4）。

---

## 4. 技术决策与踩坑记录（ADR / Known Issues）

### 4.1 关键决策
| 决策 | 原因 |
|---|---|
| 用 ToolPkg 而非普通 JS 包 | 需要 `require("../shared/core.js")` 模块共享；普通 JS 包是单文件，无法跨文件 require（实测 sandbox 报 `Cannot resolve module`） |
| 手写 JS 而非 TS | 纯 JS 无需编译，最轻量；TS 类型留作技术债（包长大再升级） |
| 复用原包环境变量凭证 | `QQBOT_APP_ID`/`QQBOT_APP_SECRET` 已在 env_preferences.xml，原包配置即生效，无需重新配置 |
| 不修改原包 | 用户明确要求"不顶替原包"；原包继续承担收消息+自动回复桥 |
| 增强版 Gateway 独立端口 32146 | 与原包 32145 物理隔离，可同时安装但**不可同 AppID 同时运行**（会被挤下线） |
| git push 改用 REST API | smart HTTP 被墙（curl 测试 000 超时），但 api.github.com 通（0.9s 200） |

### 4.2 踩坑记录（新窗口 AI 必看，避免重复踩）
1. **git 在 /sdcard 上失败**：`unable to write file .git/objects`（FUSE 文件系统兼容问题）。解法：在 proot 的 `/root/qqbot-pro-git` 建镜像仓库，文件从 /sdcard 拷贝进去，git 操作全在 /root 做。
2. **git dubious ownership**：proot root 访问 Android 文件报错。解法：`git config --global --add safe.directory /sdcard/Download/qqbot-pro`。
3. **git push 不通**：smart HTTP 被墙。解法：**用 Python + REST API 上传**（base64 → PUT /contents/{path}），更新已有文件需先 GET 拿 sha。
4. **分支名**：git init 默认 master，GitHub 默认 main。用 `git branch -m main` 重命名后 `git push -u origin main`。
5. **sandbox 读不到环境变量**：`debug_run_sandbox_script` 不注入软件设置 env，`getEnv("QQBOT_APP_ID")` 返回空。**不影响生产**——真实 ToolPkg 工具执行时由宿主注入（原包即如此）。验证真实链路请用工具调用，不要用 sandbox 脚本。
6. **工具会话快照**：`debug_install_toolpkg` 注册的新工具，**当前会话看不到**，需新开会话。这是机制不是 bug。
7. **原包 Gateway 前缀过滤**：`should_queue_event` 用 `C2C_*`/`GROUP_*`/`FRIEND_*` 前缀匹配，所以 GROUP_MEMBER_ADD 等其实**已入队**；真正被挡的只有 INTERACTION_CREATE 等。增强版已全放开。
8. **manifest 的 main 路径**：相对 ZIP 根目录（`dist/main.js`），subpackage entry 也相对根目录。
9. **同 AppID 双 Gateway 互踢**：原包 + 增强版不可同时跑同一个 AppID，文档和工具描述里都要警告。
10. **dev_package 与主目录双副本**：改代码要 cp 同步两边（src → dist → dev_package → 主目录 → GitHub），手动流程，容易漏。**已列入技术债**（未来加 build.sh）。

### 4.3 技术债（详情见 STATUS.md 第4节）
- 无 TS 类型声明、无自动构建脚本（dist 手动 cp）
- 无 token 缓存（每次调用重新获取 access_token）
- 无错误码映射（官方 40007/50002 等未细化）
- 无超时重试
- 凭证复用耦合（若原包改凭证会失效，可加 QQBOT_PRO_APP_ID/SECRET 独立覆盖）

---

## 5. 工作流程（新窗口照此执行）

### 5.1 开发→烧录→同步→推送
```bash
# 1. 改代码：编辑 /sdcard/Download/Operit/dev_package/qqbot_pro/src/...
# 2. 同步 dist（手写 JS，dist=src 拷贝）
cp src/shared/*.js dist/shared/
cp src/packages/*.js dist/packages/
cp src/main.js dist/main.js
# 3. 语法检查
node --check dist/packages/xxx.js
python3 -m py_compile resources/qqbot_pro_gateway.py
# 4. 烧录进 Operit（关键一步）
#    调用 operit_editor:debug_install_toolpkg, source_path=dev_package/qqbot_pro
# 5. 同步主目录
cp -r dev_package/qqbot_pro/* /sdcard/Download/qqbot-pro/package/
# 6. 推送 GitHub（用 REST API，不要 git push！）
#    python3 脚本 base64 上传，更新已有文件先 GET sha
# 7. 更新 STATUS.md / HANDOFF.md（每次迭代必须）
```

### 5.2 关键工具
- `operit_editor:debug_install_toolpkg` —— 烧录包（source_path 传目录）
- `operit_editor:debug_run_sandbox_script` —— 验证代码片段（注意：读不到 env）
- `super_admin:terminal` —— 终端（git、python、语法检查）
- GitHub REST API（curl/python）—— 上传文件

### 5.3 测试提醒
- 新工具要**新开会话**才可见
- 真实调用链路：凭证在 env_preferences.xml（AppID 1904028946），工具执行时宿主注入 env
- 原包 Gateway 当前运行中（botUsername "渡渡！♡"），队列空

---

## 6. 资源与凭证清单

| 资源 | 位置 | 说明 |
|---|---|---|
| GitHub token | 记忆库「凭证/完整凭证与密钥（2026-07-20更新）」 | do-do026 账号，fine-grained PAT，含 repo 权限 |
| QQBOT_APP_ID/SECRET | /data/user/0/com.ai.assistance.operit/shared_prefs/env_preferences.xml | AppID 1904028946，运行时注入 |
| 增强版 Gateway | package/resources/qqbot_pro_gateway.py | 981+25 行，端口 32146 |
| 开发环境 | /sdcard/Download/Operit/skills/SandboxPackage_DEV/ | 官方 types + 两份 guide + 42 内置包示例 |
| 官方文档参考 | bot.q.qq.com/wiki/develop/api-v2/ + sitemap.xml | v2 API 全量 |

---

## 7. 敏捷资源分配建议（Sprint Planning）

**当前状态**：单人（渡渡）+ 用户（初尘），无预算约束，Token 额度受 API 供应商影响（曾因额度断联）。

**下个 Sprint 建议**（按性价比排序）：
1. **P0：新会话真实验证**（0.5 工期，必须先做）—— 验证 11 个工具真实调用，修 bug
2. **P1：M2 体验包**（1 工期）—— SSRF 防护 + Markdown 分块，便宜且安全
3. **P1：M3 流式包**（2-3 工期）—— 官方流式体验提升最大，依赖 T02 已完成 ✅
4. **P2：M4 交互包**（2-3 工期）—— 键盘按钮，respond_interaction 已备好，可并行
5. **P3：M5 媒体包**（3-4 工期）—— 分片上传 + 图片移植
6. **P4：M6 架构包**（4-5 工期）—— 多账号/Webhook，等前面稳定再做

**资源重排建议**：
- 若 API 额度紧张 → 优先 P0 验证 + M2（都便宜）
- 若想尽快体验 → M3 流式（但要接受 2-3 工期的投入）
- **开发目录统一**（消除双副本同步债）值得提前做：把 dev_package 改为软链或直接只用主目录，省每次 cp

---

## 8. 给新窗口的第一句话建议

```
读 /sdcard/Download/qqbot-pro/HANDOFF.md（或 GitHub do-do026/qqbot-pro 的 HANDOFF.md），
接续 qqbot-pro 工程。先看 STATUS.md 和 ARCHITECTURE.md，
然后按第 5 节工作流程干活。当前 M1 完成 v0.2.0，下一步见第 7 节。
```

---

*本文件由渡渡维护。每次迭代结束必须同步更新（STATUS.md + HANDOFF.md + GitHub）。*
