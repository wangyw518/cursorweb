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

## 五、美团渠道专项深度核对（重点）

美团（点评直果 zhenguo 开放平台）是全系统迭代最多的模块（PMS-TD-003 一路做到 TD-064，约 50 个 TD）。代码在 `services/api/app/api/v1/channels_meituan.py`（路由）+ `services/api/app/services/channels/meituan/`（30 个文件）。清单第 "美团渠道" 一节方向对，但**把它压缩得太简略**，丢了很多关键能力和"到底同步了哪些信息"。

### 5.1 完整功能清单（按类别）

**(1) OAuth / 连接管理**
- 生成授权链接 `GET /channels/meituan/authorize`（state 防 CSRF，存 Redis，见 `state.py`）
- 授权回调 `GET /channels/meituan/callback`（落 access/refresh token + 门店绑定）
- 连接状态 `GET /channels/meituan/status`、断开 `DELETE /channels/meituan/disconnect`、重置 `POST .../reset`
- **公司网关中转授权** `GET /channels/meituan/relay-callback`（PMS-TD-004，OAuth 经公司 gateway 转发）
- **mock-bind 联调** `GET /channels/meituan/debug/mock-bind`（dev 用全局 singleton token，PMS-TD-004）
- **token 自动刷新 + 刷新失败自动停用连接**（`scheduler_jobs.run_meituan_token_refresh`，token 寿命约 1h，半小时控频；refresh 失败标记 `meituan_channel_disabled_by_refresh_failure`，后续 cron 跳过）

**(2) 拉取同步（美团 → PMS，只读入站）**
- **房源/产品同步** `sync_product.py`（PMS-TD-003 T4）：房型、房间、房东级房间池
- **房源静态信息同步** `sync_product.py`（PMS-TD-061）：封面图/图集、地址、**经纬度坐标**、**设施（拉 307 条全局设施字典翻译）**、描述、面积
- **订单同步** `sync_order.py`（PMS-TD-003 T5 + 010 增量窗口）：列表分页 + 逐单 `orderDetail`（5 路并发），90 天首灌 / 24h 增量
- **结算财务同步** `settlement_sync.py`（PMS-TD-035/051）：从 `orderDetail.priceInfo` 落 `booking_settlements`
- **入住指南导入** `guide_import.py`（PMS-TD-058）+ **自动"只填空"导入 cron**（PMS-TD-064，错峰 13/43 分）
- **房客资料补全** `guest_profile.py`（3002 echo 取昵称/头像，PMS-TD-052）、`public_profile.py`（3003 公众号 publicId 昵称/头像，PMS-TD-054）

**(3) 反向推送（PMS → 美团，出站；走 `meituan_push_outbox` + `push_worker`）**
共 11 个 payload builder（`push.py`），动作（`ACTION_TO_PATH`）：
- 订单：`order_accept` 接单、`order_refuse` 拒单、`order_cancel` 取消、`arrange_room` 排房、`order_check_in` 确认入住、`order_refuse_negotiate_refund` 拒绝协商退款
- 日历：`room_status_update` 房态、`room_price_update` 价格、`room_stock_update` 库存（按日批量）
- 房源：`product_info_update` 房源信息、`product_media_update` 房源图片
- **自动排房**：日历有空房时自动给美团订单排房，溢出生成待办（PMS-TD-017）
- **推送失败可见性**：失败按业务码分类、永久失败通知房东、38266 重试（PMS-TD-011/060）

**(4) inform 通用 Webhook（美团 → PMS，23 种事件）** `POST /channels/meituan/webhook/inform`
- 入站 AES 解密 `encryptedParam$`（PMS-TD-013），落 `meituan_inform_inbox`
- **1001 库存 / 1002 房态 / 1005 价格 / 1113 房间状态** → 触发**价格反向取价同步**（`inform_price_sync.py`，PMS-TD-055）
- **1003 上架 / 1004 下架 / 1111 房间静态变更 / 1112 房间-房源绑定** → 触发**单产品同步**（`inform_product_sync.py`，PMS-TD-053）
- **2001 订单状态 / 2002 退款 / 2003 排房** → 触发**即时订单同步**（`inform_order_sync.py`，PMS-TD-015）
- **3001 房客→房东 / 3002 房东→房客 / 3003 公众号→房东** → 翻译成 `IncomingOTAMessage` 入收件箱（`inbound.py` + `message.py`）

**(5) 聊天消息**
- 收：3001/3002/3003 三种来源（`inbound.py`）；3003 系统消息 body 是序列化 JSON 需二次解析
- 发：`POST /channels/meituan/send-message`（房东回复，调美团 message API）
- 据订单建会话 `POST .../conversation-from-booking`；**占位会话（placeholder conversation）机制**：订单先建占位会话，收到首条消息再激活（PMS-TD-009/028，含每 5 分钟救济 cron）
- 系统/营销会话折叠（PMS-TD-054/057）

**(6) 其它**
- **协商退款设置查询** `GET /channels/meituan/negotiate-refund-settings`
- **生命周期事件 → AI 待办通知**（订单状态变更生成 `AgentTask`，PMS-TD-025）
- **连接失效横幅 + 重新授权入口**（PMS-TD-050）
- 订单号 hex↔数字双存（`channel_booking_id` + `channel_booking_id_plain`，PMS-TD-006）

### 5.2 定时任务（cron）汇总

| cron 入口 | 频率 | 作用 |
|---|---|---|
| `run_meituan_sync_all` | */10 分钟 | 串行 token 刷新 → 房源同步(30min 控频) → 订单同步(每轮) |
| `run_meituan_settlement_sync` | 独立 | 结算财务同步 |
| `run_meituan_sync_price` | 9-54/15 错峰 | 美团→PMS 价格反向同步（TD-055） |
| `run_meituan_guide_auto_import` | 13/43 分错峰 | 入住指南自动"只填空"导入（TD-064） |
| `run_meituan_push_worker` | 持续 | 消费 outbox 反向推送美团 |
| 占位 conv 救济 | 每 5 分钟 | 激活滞留占位会话（TD-028） |

### 5.3 "美团到底同步了哪些重要信息？"（数据字段层面）

**A. 订单信息**（`mapper.py` `map_order_to_booking_fields`）：渠道 `meituan`、美团订单号（hex + 数字 plain）、**房客姓名 guestName**、**房客手机号 mobile**、入住/退房日期、间夜数、**订单金额（分）**、订单状态（美团 4 位码映射）、备注 remark→notes、排房房间 `arrangeRoomInfos[0].roomId`→本地 room_id。

**B. 结算财务信息**（`settlement_mapper.py` → `booking_settlements`，**金额全程"分"**）：
- `sellingMoney` 挂牌房费、`commission` 平台佣金、`commissionRate` 佣金率（千分位整数，1000=10%）、`incomeMoney` 净房费（= 挂牌 − 佣金）、`deposit` 押金、`discount` 优惠、`cancelMoney` 退款、`orderMoney` 订单总额、`roomPriceItemList` **按日房价+佣金率明细**、原始 `priceInfo` 留底。带勾稽校验（挂牌 − 佣金 == 净房费）。

**C. 房源/房型信息**（`mapper.py` + TD-061）：房型名 title、挂牌价 normalPrice、户型 layoutRoom→bedrooms、房间名 roomName、**封面图/图集**、**详细地址**、**经纬度坐标**、**设施（翻译 307 条字典）**、描述、面积。

**D. 入住指南内容**（`guide_import.py`，TD-058/064）：Wi-Fi 名/密码、路线图片+到达指引文字、门锁密码使用说明。（**注意**：不导入门锁密码本体，不覆盖 house_rules / lock_mode 等本地字段。）

**E. 房客社交资料**：昵称 nickname、头像 avatar（两个来源：3002 房东 echo / 3003 公众号 publicId）。

**F. 聊天消息**：3001/3002/3003 的文本/产品消息内容、收发时间、收发方 ID。

### 5.4 清单在美团部分的具体遗漏 / 不足

| 清单写法 | 实际情况 / 遗漏 |
|---|---|
| "同步：产品/订单/价格/结算/指南导入/客人资料补全" | 方向对，但漏了**房源静态信息（地址/经纬度/设施/图片/面积）**、**指南自动只填空 cron**、客人资料补全有 **3002/3003 两个来源** |
| "订单动作：接受/拒绝/取消/确认入住/拒绝协商退款/撤销房间分配" | 漏了 **arrange_room 排房 + 自动排房 + 溢出待办**；"撤销房间分配"在代码里没有独立动作 |
| 没有单列"反向推送房态/价格/库存" | 实际有 `room_status/price/stock_update` 三个**日历反向推送**动作（出站到美团），是核心能力 |
| "Webhook：新订单/状态变化/消息/授权/退款" | 实际是 **23 种 inform 事件**，细分到库存(1001)/房态(1002)/价格(1005)/上下架(1003/1004)/房间变更(1111/1112/1113)/订单(2001-2003)/消息(3001-3003)，且**入站要 AES 解密** |
| 没提结算字段 | 结算同步的是**完整财务明细**（挂牌/佣金/佣金率/净房费/押金/优惠/退款/按日明细），不是单一数字 |
| 没提会话机制 | **占位会话 + 激活 + 救济 cron** 是消息打通的关键设计 |
| 没提推送可靠性 | **outbox + push_worker + 业务码分类 + 失败通知房东 + 重试** 是反向推送的核心 |
| 没提连接健壮性 | **token 自动刷新 + 刷新失败自动停用 + 失效横幅 + 重新授权** |
| 没提 mock-bind / relay-callback | dev 联调与**公司网关中转 OAuth**两条接入路径 |

> 一句话：清单把美团当成"OAuth + 几个同步 + Webhook"，实际它是一套**双向（拉取入站 + 反向推送出站）、事件驱动（23 种 inform）、带可靠投递（outbox/worker/重试）、覆盖房源/订单/财务/指南/消息/房客资料全链路**的渠道中台。

---

### 附：核对依据

- 功能清单原文：有道云笔记《久窝系统现有功能模块 list》（已抓取全文比对）
- 代码：`joywo` 仓库 `main` 分支
  - 后端路由清单见 `services/api/app/api/v1/router.py` 及各 `*.py`
  - 业务服务见 `services/api/app/services/`
  - mbs-api 见 `services/mbs-api/src/modules/`
  - 前端见 `apps/*/src/`（路由/pages）
- 文档：`jiuwo-docs/tech/`（PMS-TD-001~064、PLATFORM-TD-001~009、CMS-TD-001~003、MBS-TD）与 `AUDIT-ACTIONS.md`
