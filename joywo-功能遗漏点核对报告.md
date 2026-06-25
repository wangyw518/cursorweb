# joywo 功能清单遗漏点核对报告

> 核对对象：有道云笔记《久窝系统现有功能模块 list》
> 核对方式：对照 `joywo`（codeup.aliyun.com/jowo/joywo，`main` 分支）实际代码逐模块比对
> 核对范围：`services/api`（FastAPI 主后端）、`services/mbs-api`（NestJS）、`services/worker`、`services/gateway`、5 个前端 app、`jiuwo-docs` 技术/产品文档

---

## 〇、结论速览

原清单整体梳理得相当完整，三条业务线（PMS 供给侧 / MBS 消费侧 / 公安监管）和主干模块都覆盖到了。但**确实有一批功能点被遗漏或描述不准确**，按重要程度分三类：

- **A. 完全没写到的功能/模块**（建议补充）：未来居客控、计费/订阅、邮件验证码、海鑫人像核验、微信小程序 URL Link、AI 每日限额、审计日志、行政区划/派出所/节假日基础数据、MCP 工具回调、意见反馈（房东侧/飞书）等。
- **B. 描述与实际代码不符**（建议修正）：`police-gateway`/`police-collector` 两个服务实际并不存在；`gateway` 服务是空壳；worker 实际只有 3 个任务而非 4 个；门锁"outbox 重试"任务并不在 worker 里。
- **C. 写了但偏笼统、可补细节**：经营监控（Monitor）的具体场景、未成年/公安"五必须"合规硬闸、美团反向同步、渠道失效横幅、消息中心的会话分类等。

---

## 一、清单完全遗漏的功能点（A 类）

### A1. 未来居客控（FutureHome IoT）— **重要遗漏**

清单里"门锁管理"只提了通通锁、久蝉，但代码里还有一套**完全独立的「未来居客控」智能客控系统对接**，清单只字未提。

- 路由：`services/api/app/api/v1/future_home.py`
  - `GET/PUT /properties/{property_id}/future-home/config`（门店级客控开关与配置）
- 服务编排：`services/api/app/services/future_home/`（`client.py` / `mapper.py` / `service.py`）
- 数据模型：`services/api/app/models/future_home.py`（`PropertyFutureHomeConfig`、`FutureHomePushLog`）
- 前端入口：`pms-web` 门店编辑表单里的"未来居客控"开关。

这是与门锁并列的另一类硬件对接（房间内灯光/空调等客控推送），应单列。

### A2. 计费 / 订阅 / 充值（Billing）— **重要遗漏**

`pms-web` 有完整的一套计费前端，清单完全没提：

- `pms-web` 路由：`/app/billing`（订阅/余额/用量/充值）、`/app/billing/plans`（套餐）、`/app/billing/orders`（账单）、`/app/billing/usage`（用量明细）、`/app/billing/checkout/[orderNo]`（支付页）。
- 注意：后端 `services/api` **目前没有对应接口**（属于"有前端、走 mock"的状态，与清单里"知识库有接口无界面"正好相反）。这点值得单列说明。

### A3. 邮件验证码（DirectMail）

清单第 1 节只写了"短信验证码"，实际还有**邮件验证码**通道：

- 服务：`services/api/app/services/email.py`（注册/登录/改密等 purpose 文案，阿里云 DirectMail）
- 文档：`jiuwo-docs/tech/platform/PLATFORM-TD-001-邮件服务...`

### A4. 海鑫智圣人像核验（实人认证三方）

清单入住指南里只说"是否要求身份核验 / 提交身份证 / 上传照片"，但**真正的人像比对核验厂商集成**没提：

- 服务：`services/api/app/services/identity_verification.py`（海鑫智圣 `verify_v3`，provider=`haixin-verify-v3`）
- 公共核验流程：`services/api/app/services/identity_confirm.py`（主入住人/同住人共用）
- 文档：`PMS-TD-041 C端公开接口对接手册` §3.5.4

### A5. 微信小程序 URL Link

清单提到 `mbs-web` 编译微信小程序，但 PMS 后端有一套**微信小程序 URL Link 生成**逻辑（用于短信/指南跳转小程序），未提：

- 服务：`services/api/app/services/wechat_mini_program.py`（access_token、generate_urllink、配置级缓存）
- 模型：`services/api/app/models/wechat.py`

### A6. AI 每日限额（ai_quota）

清单第 9 节 Agent 没提 AI 用量管控：

- 服务：`services/api/app/services/ai_quota.py`（按用户每日固定额度、Redis 计数、fail-open）
- 仅作用于 `POST /agents/chat`，自动化监控不受限。

### A7. 审计日志（Audit）— 跨切面遗漏

全系统大量写审计，清单完全没提：

- 服务：`services/api/app/services/audit.py`，模型 `app/models/audit.py`
- 动作字典：`jiuwo-docs/tech/platform/AUDIT-ACTIONS.md`（100+ 审计动作，涵盖合规/美团/结算）
- 现状：只有写入、**没有查询 UI**，可作为"有数据无界面"的一项列出。

### A8. 基础主数据：行政区划 / 派出所 / 法定节假日

这三个公开只读接口清单都没单独提（它们支撑公安填报与日历定价）：

- 行政区划：`GET /regions/children`、`/regions/...`（`api/v1/regions.py`，GB/T 2260 省市区三级，文档 PLATFORM-TD-005）
- 派出所主数据：`GET /police-stations`（`api/v1/police_stations.py`，按区县码查，文档 PLATFORM-TD-006）—— `pms-web` 新建房间 `/app/rooms/new` 选派出所用
- 法定节假日/调休：`GET /holidays`（`api/v1/holidays.py`，中国内地节假日，供日历/定价用）

### A9. MCP 工具回调端点

供 AI Agent（OpenClaw）回调执行工具的协议端点，清单没提：

- 路由：`api/v1/mcp.py`（`GET /mcp/tools`、`POST /mcp/call`，Bearer Key 校验）
- 工具清单/动作注册：`services/api/app/services/agent_tools.py`、`agent_actions.py`

### A10. 意见反馈（房东侧 / 飞书）

清单只在 MBS 旅客端提了"提交反馈"。`pms-web` 也有**房东侧全局意见反馈入口**（浮动按钮，提交到飞书）。MBS 运营后台也有反馈列表（`mbs-admin-web /admin/content/feedback`）。

### A11. MBS 旅客端的零散功能

清单 MBS 旅客端写得较全，但漏了：

- **账号注销**：`POST /mbs/v1/account/deactivate`（`mbs-api` app-info 模块）
- **App 版本检查**：`GET /mbs/v1/app/version`（清单提了"查看 App 版本"，✅ 已覆盖）
- **管理员重置密码 / 启停账号**：`mbs-admin` 的旅客与员工账号 `reset-password`、`isActive` 切换。

---

## 二、与实际代码不符的描述（B 类，建议修正）

### B1. `police-gateway` / `police-collector` 两个服务**并不存在**

清单"总体理解"和末尾都写：公安/监管后端是 `police-gateway` + `police-collector`。但仓库 `services/` 下只有 `api / mbs-api / worker / gateway` 四个目录，**全仓搜索不到** `police-gateway`/`police-collector` 任何代码。

实际公安/HDSP 上报是在：

- `services/api/app/services/hdsp/`（`client.py` / `crypto.py` / `mapper.py` / `service.py` / `sync_state.py`）+ `api/v1/hdsp.py`（`POST /hdsp/push`）
- worker：`services/worker/joywo_worker/hdsp_incremental.py`（HDSP 增量推送）
- 还有**区域定制上报映射** `HdspAdminDivisionUploadMapping`（如蓬莱 penglai 等区县映射，见 `feature/penglai-hdsp-upload-mapping` 分支痕迹）。

建议把"police-gateway + police-collector"改成"在 `services/api` 的 `hdsp` 模块 + `worker` 实现"。

### B2. `gateway` 服务是空壳

清单仓库结构提到 `services/gateway`（网关/BFF/edge gateway），但该目录下**只有 `.gitkeep`**，没有任何实现。真正的 BFF 角色由 `mbs-api`（转发 PMS 公开指南接口、HMAC 签名）承担。

### B3. worker 任务数与清单不符

清单说 worker 跑 4 个周期任务，含"门锁厂商 outbox 重试"。实际 `services/worker/joywo_worker/` 只有 **3 个**：

- `guide_sms_retry.py`（入住指南短信失败重试）✅
- `hdsp_incremental.py`（HDSP 增量推送）✅
- `auto_overdue_checkout.py`（逾期自动退房）✅

**没有"门锁厂商 outbox 重试"**。门锁临时密码的撤销是 API 侧的 cron（`/locks/passcodes/revoke-due` + scheduler），`outbox_relay.py` 是 Centrifugo 实时消息投递（与门锁无关）。建议修正这一条。

### B4. 涂鸦（Tuya）门锁仅文档规划、未落地（反向提醒）

不是清单的错（清单只写了通通锁/久蝉，与已落地的 `services/api/app/services/locks/providers/`（`ttlock.py`、`jiuchan.py`）一致）。但文档 PLATFORM-TD-001 把涂鸦也列为适配目标，实际未实现——如果以后照文档梳理，注意别把涂鸦算成"现有功能"。

---

## 三、写了但偏笼统、可补充细节（C 类）

### C1. 经营监控（Monitor）的具体场景

清单第 9 节只说"监控经营异常"。实际有一组明确的监控器（`services/api/app/services/monitors/`）：

- `revenue_anomaly.py`（收入异常）
- `occupancy_trend.py`（入住率趋势）
- `today_tail_rooms.py`（今日尾房）
- `last_minute.py`（临期/last-minute）
- `underpriced_date.py`（低价日/捡漏）
- `vacancy_gap.py`（空档）
- `checkin_prep.py`（入住准备）

调度在 `monitors/runner.py`。这些正是"AI 任务/待办"的来源，值得在清单里点名。

### C2. 未成年 / 公安"五必须"合规硬闸

清单订单里只写了"监护人/未成年人相关标记"。实际是一套**会硬性拦截入住**的合规闸：

- 服务：`services/api/app/services/checkin_compliance.py`（监护人 + 公安"五必须"逐项审计、`is_five_must_complete` 硬闸）
- 模型：`app/models/checkin_compliance.py`
- 文档：PMS-TD-042 / 046 / 047 / 062

### C3. 美团渠道的细分能力

清单美团部分整体覆盖了，但有几个明确做过的子能力值得点出（均有对应 TD 与代码）：

- **反向同步**：美团→PMS 的价格/房态/状态反向同步（PMS-TD-055，`channels/meituan/sync_*`、inform_*_sync）
- **结算同步与结算卡**：`booking_settlement` 模型 + 经营数据结算字段（PMS-TD-051，前端 `NEXT_PUBLIC_SETTLEMENT_CARD_ENABLED`）
- **连接失效横幅 + 重新授权入口**（PMS-TD-050）
- **房源静态信息同步**（图片/地址/设施，PMS-TD-061）
- **客人昵称/头像补全 echo**（PMS-TD-052）
- **自动排房 + 溢出待办**（PMS-TD-017）

### C4. 消息中心会话分类

清单第 8 节消息中心可补：会话分**房客（OTA/美团）会话、智能助手（管家/Monitor）虚拟会话、系统/营销消息**三类，且系统消息 Tab、美团系统会话折叠都受 feature flag 控制（`pms-web /app/inbox`）。

### C5. 入住指南三层配置 & 双前端

清单房东侧已覆盖。可补：指南配置实为**全局默认 / 房间级 / 链接级**三层；旅客侧入口有**三套前端**：`pms-web /guide/[token]`、独立 `mbs-guide-web`、以及 `mbs-web` 内嵌 `order/detail?token=`（功能高度重叠，定位不同）。

### C6. CMS 不止"文章"

清单第 12 节写"文章"。CMS 实际同时管 **post（文章）和 page（页面）两种 kind**，富文本支持**视频嵌入（B站/YouTube）和七牛图片上传**（CMS-TD-001/002/003），公开展示在 `pms-web /blog/*`，并有 `ENABLE_CMS` kill switch。

---

## 四、逐条对照小结表

| 模块 | 清单状态 | 核对结论 |
|---|---|---|
| 认证与账号 | 写了短信验证码 | 漏：**邮件验证码**、ws-token 已写 ✅ |
| 门店管理 | ✅ | 漏：门店级**未来居客控**开关 |
| 房型与房间 | ✅ | 新建房间含**派出所/区划选择**（公安填报）未点出 |
| 从业人员 | ✅ | 准确 |
| 订单与日历 | ✅ | 漏：**未成年五必须合规硬闸**细节 |
| 入住指南 | ✅ | 漏：**海鑫人像核验**、三层配置、三前端 |
| 门锁管理 | 通通锁/久蝉 | 漏：**未来居客控**（独立硬件线） |
| 美团渠道 | 较全 | 可补反向同步/结算卡/失效横幅等子能力 |
| 消息中心 | ✅ | 可补会话三分类 |
| Agent/智能助手 | ✅ | 漏：**AI 每日限额**、Monitor 7 场景、**MCP 回调** |
| 知识库 | ✅（有接口无界面） | 准确 |
| 经营数据 | ✅ | 准确（ADR/RevPAR/结算维度） |
| CMS | 文章 | 漏：**页面(page)**、视频嵌入、kill switch |
| HDSP/公安 | ✅ | **后端服务命名错误**（无 police-gateway/collector）|
| — | 未提 | 漏：**计费/订阅**、**审计日志**、**行政区划/节假日**、**微信小程序 URL Link**、**房东侧意见反馈**、**MBS 账号注销** |
| 自动任务/worker | 4 个任务 | 实际 **3 个**，无门锁 outbox 重试 |
| gateway | 列在结构里 | **空壳（仅 .gitkeep）** |

---

### 附：核对依据

- 功能清单原文：有道云笔记《久窝系统现有功能模块 list》（已抓取全文比对）
- 代码：`joywo` 仓库 `main` 分支
  - 后端路由清单见 `services/api/app/api/v1/router.py` 及各 `*.py`
  - 业务服务见 `services/api/app/services/`
  - mbs-api 见 `services/mbs-api/src/modules/`
  - 前端见 `apps/*/src/`（路由/pages）
- 文档：`jiuwo-docs/tech/`（PMS-TD-001~064、PLATFORM-TD-001~009、CMS-TD-001~003、MBS-TD）与 `AUDIT-ACTIONS.md`
