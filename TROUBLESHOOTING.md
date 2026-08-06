# qqbot-bridge-pro 排障日志 (Troubleshooting Log)

> 记录开发/运行中遇到的问题、根因、修复方案和验证方法。
> 格式：问题 → 现象 → 根因 → 修复 → 验证 → 关联 Epic

---

## 2026-08-06

### T001：Gateway 积压消息落盘时无时间戳，AI 误判为实时消息

**现象**：
- 下午 QQ 群里发的 @Bot 消息，晚上桥接开启后才被转发到 Operit 对话
- AI 看到消息时以为是"刚刚发的"，按实时消息回复，造成对话混乱

**根因**：
- Gateway 事件自带 `timestamp`（QQ 用户发送时间）和 `receivedAt`（Gateway 接收时间），但桥接代码 `buildInboundChatContextAttachment` 没有把它们写进上下文 attachment
- 同时缺少积压检测：消息在 Gateway 队列堆积数小时后被处理，没有任何标记提醒 AI

**修复**（2026-08-06 20:4x，烧录验证）：
1. `buildInboundChatContextAttachment` 新增 `sentAt:`（来自 event.timestamp）和 `receivedAt:` 行
2. `buildGroupAggregateContextAttachment` 新增 `batchLastSentAt:` 和 `receivedAt:` 行（群聚合场景）
3. 积压检测（阈值 10 分钟）：
   - 单聊：attachment 顶部插入 `[stale: 延迟 N 分钟到达的历史消息...]`
   - 群聚合：遍历 events 找最旧 timestamp，超阈值则在聚合正文前加 `[stale: 本批消息最早发送于 N 分钟前...]`
4. 相关文件：`package/src/shared/bridge_auto.js`

**验证方法**：
- 查看入站消息的上下文 attachment 是否包含 `sentAt:` 和 `receivedAt:` 行
- 发送一条消息后暂停桥接 >10 分钟，再重新开启，检查落盘消息是否带 `[stale]` 标记

**关联 Epic**：G0 收尾（时间戳补漏）；G1（可配置 stale 策略：forward_with_timestamp / drop）

**待完善（G1）**：
- `staleMessagePolicy` 可配置字段（目前硬编码 10 分钟阈值，策略固定为 forward_with_timestamp）
- `staleMessageThresholdMs` 环境变量暴露
- Gateway 队列积压上报（status 工具显示 oldestEventAt / newestEventAt）

---

### T002：flushDueGroupBucketsAsync 中的 groupAggregateWindowMs=0 被 parsePositiveInt 误判

**现象**：配置 `group_aggregate_window_ms=0`（不聚合）时抛异常

**根因**：`processAutoReplyQueueOnceAsync` 用 `parsePositiveInt(latestContext.config.groupAggregateWindowMs, "groupAggregateWindowMs", 0)` 读取——`parsePositiveInt` 要求正整数，0 被判断为非法

**修复**（G0）：改为 `Number(latestContext.config.groupAggregateWindowMs) || 0`

---

### T003：trimRecordMap 用 Number() 解析 ISO 时间字符串导致排序失效

**现象**：records 超过 200 条时保留的不是最新 200 条

**根因**：`trimRecordMap` 里 `const updatedAt = Number(value?.updatedAt ?? 0)`——`updatedAt` 是 ISO 字符串（如 `2026-08-06T05:05:00.000Z`），`Number(ISO字符串)` 返回 `NaN`，排序完全失效

**修复**：改为 `Date.parse(value?.updatedAt ?? "") || 0`

---

### T004：git 在 /sdcard 上写 loose object 失败

**现象**：在 `/sdcard/Download/qqbot-pro` 下 `git add -A && git commit -m '...'` 报错 `unable to write file .git/objects/...: No such file or directory`；git log 显示无任何提交。

**根因**：Android /sdcard 底层是 FUSE 文件系统，git 创建 loose object（`.git/objects/xx/xxxx...`）时与 FUSE 的 inode/权限模型不兼容。

**修复**（2026-08-06 00:1x）：
1. 在 proot 的 ext4 分区建镜像仓库：`mkdir -p /root/qqbot-pro-git`
2. 文件从 /sdcard 物理拷贝进镜像仓库：`cp -r /sdcard/Download/qqbot-pro/* /root/qqbot-pro-git/`
3. git 操作（add / commit / push）全部在 `/root/qqbot-pro-git` 完成

**验证方法**：在 /root 镜像仓库中 `git commit -m 'test'` 正常执行；`git log --oneline` 显示提交记录。

**关联**：T005（同环境）、T006（同环境 git push 被墙）。

---

### T005：proot 下 git 报 dubious ownership

**现象**：`git log / git status` 报 `fatal: detected dubious ownership in repository at '/sdcard/Download/qqbot-pro'`，提示 `git config --global --add safe.directory`。

**根因**：proot 以 root 用户运行，仓库文件由 Android 用户（uid 10272）创建，git 安全机制拒绝跨用户访问。

**修复**（2026-08-06 00:1x）：`git config --global --add safe.directory /sdcard/Download/qqbot-pro`

**验证方法**：执行后 `git log` 正常返回。

---

### T006：git push smart HTTP 被墙，但 REST API 畅通

**现象**：
- `git push origin main` 长时间无响应后超时或断开
- `curl -m 10 -o /dev/null -w '%{http_code}' https://github.com` 返回 `000`（10s 超时）
- `curl -m 10 -o /dev/null -w '%{http_code}' https://api.github.com` 返回 `200`（0.9s 完成）

**根因**：国内网络环境对 `github.com`（git smart HTTP 协议）阻断，但 `api.github.com`（REST API）不受影响。

**修复**（2026-08-06 00:1x）：放弃 git push，改用 **Python + GitHub REST API 上传文件**：
- 新文件：`PUT /repos/{repo}/contents/{path}` + `content`（base64 编码）→ `branch: main`
- 更新已有文件：先 `GET` 取 `sha`，再 `PUT` 带 `sha` 字段
- Python 标准库 `urllib.request` + `base64`，不依赖 `requests` 或额外包

**验证方法**：任一文件以 Python 脚本上传后，`curl api.github.com/repos/do-do026/qqbot-pro/contents/{path}` 返回 200。

**关联**：T004/T005（git 环境问题）、HANDOFF.md 第 5 节工作流程（标注"不要 git push！"）。

---

### T007：sandbox 独立脚本读不到 Operit 环境变量

**现象**：
- `debug_run_sandbox_script` 中 `getEnv("QQBOT_APP_ID")` 返回空字符串
- `verify_live.js` 测试报 `Missing QQBOT_APP_ID / QQBOT_APP_SECRET in env`
- 但 `env_preferences.xml` 中确实有 `QQBOT_APP_ID=1904028946`

**根因**：`debug_run_sandbox_script` 运行在独立沙盒上下文，不注入 Operit 软件设置中的环境变量（与真实 ToolPkg 工具调用是两条不同的执行路径）。

**修复**：**无需修复——不影响生产**。真实 ToolPkg 子包的工具被 Operit 调用时，宿主会注入 `env_preferences.xml` 中的环境变量（原包 `com.operit.qqbot_bundle` 的 `getEnv` 即如此工作，已在生产验证）。sandbox 脚本仅用于纯逻辑验证（如 buildSendBody），验证真实链路请直接调用工具。

**验证方法**：新开会话后调 `qqbot_pro_me`，如返回机器人资料则链路的 env→token→OpenAPI 全部正常。

**关联**：HANDOFF.md 第 4.2 节第 5 条。

---

### T008：require 相对路径在独立 sandbox 脚本中不可用

**现象**：
- 独立 sandbox 脚本文件 `test/smoke_core.js` 中 `require("../shared/core.js")` 报 `Cannot resolve module "../shared/core.js" from "<root>"`
- 同样的 require 在 ToolPkg 子包文件中正常工作

**根因**：`debug_run_sandbox_script` 以单文件模式执行，没有 CommonJS 模块解析上下文。独立 JS 包（非 ToolPkg）只支持单文件，无法跨文件 `require` 共享代码。

**影响**：**本决策决定了项目必须使用 ToolPkg 而非普通 JS 包**——因为 `core.js` 需要被多个子包共享（凭证/token/OpenAPI/buildSendBody）。

**修复**：采用 ToolPkg 的 subpackage 机制。子包入口在 manifest 的 `subpackages[].entry` 声明，由 Operit 在 ToolPkg 上下文中加载，`require("../shared/core.js")` 正常解析。

**验证方法**：`debug_install_toolpkg` 烧录后子包工具全部注册成功 = require 链正确。

**关联**：HANDOFF.md 第 4.1 节决策 1。

---

### T009：debug_install_toolpkg 注册工具后当前会话不可见

**现象**：
- `debug_install_toolpkg` 返回 `activate_result: "Using package: qqbot_pro_basic"` 且列出全部工具
- 但同一会话中 `package_proxy(tool_name="qqbot_pro_basic:qqbot_pro_me")` 报 `Tool not found`

**根因**：Operit 的工具列表是会话启动时的快照。`debug_install_toolpkg` 注册到系统，但当前会话的快照不会刷新。需要**新开会话**。

**修复**：**这是机制不是 bug。**每次烧录后新开会话即可。HANDOFF.md 第 5.3 节已标注。

**验证方法**：新开会话，`use_package com.operit.qqbot_pro` → `package_proxy qqbot_pro_basic:qqbot_pro_me` → 返回机器人资料。

**关联**：HANDOFF.md 第 4.2 节第 6 条。

---

### T010：原包 Gateway 事件过滤机制的误判（减少不必要工作）

**现象**：最初分析认为需要修改 Gateway 才能接收 `GROUP_MEMBER_ADD`、`GROUP_ADD_ROBOT` 等群事件，评估 T05 工作量为"复制整个 Gateway + 服务管理"。

**根因**：未仔细读原包 `qqbot_gateway_service.py` 的 `should_queue_event` 实现——它用的是**前缀匹配**（`C2C_*`/`GROUP_*`/`FRIEND_*`），而非精确事件名匹配。`GROUP_MEMBER_ADD` 等以 `GROUP_` 开头的事件**已经入队**。真正被过滤的只有 `INTERACTION_CREATE` 等非前缀事件。

**修复**（2026-08-06 00:26）：T05 聚焦于以下精准增强：
1. `should_queue_event` 新增 `INTERACTION_CREATE`、`SUBSCRIBE_MESSAGE_STATUS` 等精确事件名白名单
2. `infer_scene` 扩展：对 `INTERACTION_CREATE` 等事件通过 `payload.d.scene` / `chat_type` 判断 c2c/group/guild
3. `build_event` 新增 `interactionType` / `interactionData` 字段
4. 独立控制端口 32146

**验证方法**：查看增强版 gateway.py 中 `should_queue_event` 是否包含 `"INTERACTION_CREATE"`；`diff` 与原包对比确认改动范围。

**关联**：ARCHITECTURE.md T05 任务描述（已按实际情况修正）。

---

### T011：GitHub 分支名 master vs main

**现象**：本地 `git init` 默认 `master`，但 GitHub 仓库默认 `main`，`git push origin main` 报 `src refspec main does not match any`。

**修复**：`git branch -m main` 重命名本地分支，然后 `git push -u origin main`。

**时间戳**：2026-08-06 00:16。

---

### T012：Android FUSE 不支持 symlink（软链接）

**现象**：`ln -s /sdcard/Download/qqbot-pro/package /sdcard/Download/Operit/dev_package/qqbot_pro` 报 `Permission denied`。尝试在 proot 下也失败。

**根因**：Android /sdcard 底层 FUSE 文件系统不支持 symbolic link。

**影响**：否决了"软链统一目录"方案，选择了同步脚本方案（详见 T013）。

**修复**：见 T013。

**时间戳**：2026-08-06 00:55。

**关联**：T013。

---

### T013：开发目录双副本漂移风险（dev_package vs 主目录）

**现象**：
- 开发目录 `/sdcard/Download/Operit/dev_package/qqbot_pro`（官方烧录源）与 GitHub 镜像目录 `/sdcard/Download/qqbot-pro/package` 是两个物理副本
- 每次改代码要手动 cp 同步（src → dist → dev_package → 主目录 → GitHub），漏步就会**烧录版本与 GitHub 版本不一致**

**根因**：Operit 官方开发指南要求 dev_package 为烧录目录，GitHub 仓库需要镜像目录，两者路径不同。软链接方案不可行（T012）。

**修复**（2026-08-06 00:55，已烧录验证）：
1. 确定**唯一真相源** = `/sdcard/Download/qqbot-pro/package`（主目录）
2. 新增 `scripts/sync.sh`：一键单向同步（主目录 → dev_package） + 全部语法检查
3. 铁律：只编辑主目录，dev_package 只是会被覆盖的烧录副本

**验证方法**：改主目录文件 → `bash scripts/sync.sh` → 检查输出 OK → `debug_install_toolpkg` 烧录 → 工具注册成功。

**关联**：HANDOFF.md 第 4.2 节第 10-11 条 + 第 5.1 节工作流程。