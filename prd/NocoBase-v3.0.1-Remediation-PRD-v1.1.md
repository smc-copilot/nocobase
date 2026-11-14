# NocoBase 企业集成底座后续开发 PRD

> **版本：V1.1｜剩余功能与联调闭环版**  
> **日期：2026-11-14（北京时间）**  
> **开发仓库：smc-copilot/nocobase**  
> **统一合并目标：develop/v3.0.1**  
> **本轮复核基线：f930624436f78fd31dd1f8b4a00bda72564417ec**  
> **固定 Octop 消费者基线：64689a5b9863d974783f0605ed7673a7d5f73b22**  
> **协议边界：business-ui.v1；按固定消费者验证 receipt schema 1.1**  
> **性质：开发需求与验收规范。本文不代表功能已完成、Gate A 已通过或允许生产上线。**

## 1. 目标与文档关系

### 1.1 本轮目标

在已经合入的修复基础上，完成剩余的身份登录、真实业务授权、票据与嵌入撤销、异常操作恢复、IAM 一致性、控制面管理页面及现场联调能力。

交付结果必须同时满足：

1. 原生 NocoBase 应用能够接收并正确处理合法 Casdoor 用户凭证；浏览器登录和外部 token 访问关联到同一个稳定本地身份。
2. 用户只能操作当前获得原生权限授权的通用表单和记录，服务密钥、票据、嵌入上下文均不能替代业务授权。
3. Octop 现有 Business UI 插件可以展示真实保存、提交、拒绝、FAILED、UNKNOWN 与恢复后的权威状态。
4. 管理员可以通过控制面完成本期集成配置、撤销、查询和审计；发布人员只能管理被授权的 App。
5. 开发交付通过可复现的 Gate A，再在真实 Casdoor、Octop 和目标浏览器环境完成 Gate B。

### 1.2 与既有文档的关系

| 来源                                            | 本文使用方式                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| SMC-Enterprise-Integration-NocoBase-PRD-v1.2.md | 延续平台目标、范围、通用验收场景 A–F 和最终交付要求               |
| NocoBase-v3.0.1-Remediation-PRD-v1.0.md         | 保留 FIX-01–FIX-16、R01–R42 的既有验收要求                        |
| f9306244 本轮代码复核                           | 确定仍需完成的功能与新回归用例                                    |
| 固定 Octop Business UI 插件源码及协议           | 决定对外字段、动作、握手和卡片消费行为                            |
| 用户提供的 Adapter 协议附件                     | 仅参考对接协议与规范，不扩大本期产品范围                          |
| 项目附件 wiki-nocobase.md                       | 作为项目背景参考；架构、目录和扩展 API 以本次 V3 分支实际源码为准 |

本文是 V1.0 修复 PRD 的增量更新。重复事项按本次复核状态调整，不要求重做已完成能力；未被本文修改的既有范围及验收要求继续有效。

附件中的旧版 Koa、Sequelize、resourcer 等描述不能直接作为本分支开发指令。本期复用当前 V3 分支的 App Server、Hono、Better Auth、Authorization／Permission Sets、Releases、App Host 和 Secret 服务，不为适配旧文档重写内核。

### 1.3 基线与分支规则

本文的“当前状态”仅对应 f9306244，不代表 2026-11-14 之后其他提交的状态。实施前核对最新 HEAD、已有修复和未提交改动；已经关闭的缺口补充证据后保留，不覆盖他人实现。

开发可使用短期修复分支或受隔离的工作目录，最终代码、迁移、测试和验收文档统一通过 PR 合入 develop/v3.0.1。本文交付不包含修改代码、提交或合并操作。

## 2. 范围与边界

### 2.1 本期必须交付

| 模块                     | 本轮范围                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| NocoBase 控制面          | 原生权限入口、集成配置页面、Releases 关联 App 边界、运行与审计查询        |
| Casdoor Identity Adapter | 浏览器登录关联、准入、资源 token 验证、目录快照、权限归属和主体绑定一致性 |
| Business UI Adapter      | 用户凭证路由、原生授权、票据和 embed 生命周期、统一回执、操作恢复         |
| Integration Demo         | 通用编辑／详情表单、受控故障夹具、同用户允许与拒绝场景                    |
| 工程交付                 | 新增迁移、真实 HTTP 和数据库回归、消费者契约、部署及验收证据              |

主要代码对象：

- packages/templates/app-template-smc-control
- packages/templates/app-template-integration-demo
- packages/plugins/app-plugin-casdoor-identity
- packages/plugins/app-plugin-business-ui-adapter
- 关联配置、lockfile、迁移、测试和 prd/acceptance 文档

### 2.2 明确不包含

- HR、招聘、CRM、财务实际 App，以及这些领域的数据模型、单据、审批、报表和导入。
- Octop 核心、会话数据结构、Dashboard 或现有插件协议改造。
- Casdoor 核心改造、新表单引擎、新工作流引擎和通用低代码平台重建。
- Agent 独立业务身份、自主提交、自动审批和代理授权体系。
- 新增 Adapter→Octop webhook、后端 patchResult 或自动唤醒模型链路。
- 为绕过 Casdoor 登录问题而同时增加 PAT、共享管理员 token 等替代激活方式。

如验证发现消费者限制，先定位适配器能否在现有协议内解决；确需协议变更时单独提出变更，不作为本 PRD 默认实现内容。

### 2.3 通用表单边界

继续使用通用测试单据：标题、说明、数量、状态、版本、归属及系统编号。编辑表单和只读详情表单均读取真实持久化数据。

为验证同一用户的不同授权，可注册允许和拒绝的通用类型或测试资源；所有资源均无 HR／CRM 业务含义。不得通过切换测试用户或在请求 body 传入 userId 来替代权限差异。

## 3. 当前复核结论

### 3.1 已有能力的保留要求

本轮不重建以下已改动能力，需在后续回归中保护：

- 模板已增加相关插件依赖和装配代码。
- 握手字段已调整为固定 Octop 消费者可接受的顶层结构；独立消费者函数验证返回接受。
- OAuth code 已有加密暂存及一次消费后交付原始 code 的实现。
- 兑票路由已增加 application/x-www-form-urlencoded 解析。
- 成功回执已调整为扁平结构；草稿保存与正式提交已有区分。
- 新出票已有 nonce；详情已增加只读约束。
- 原生用户／权限页面已有注册；Provider 停用和部分权限归属保护已有实现。

其中部分结论来自源码检查，不等同于真实现场端到端验证。

### 3.2 本次实际验证边界

| 检查               | 本次结果                                          | 结论边界                                                                  |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 冻结依赖安装       | 通过，使用 --frozen-lockfile --ignore-scripts     | 不等于完整安装生命周期、四包构建及镜像构建已通过                          |
| Casdoor 插件测试   | 75 个用例通过                                     | 不等于浏览器首登及真实 Casdoor 联调通过                                   |
| Adapter 插件测试   | 14 个用例通过                                     | 其中消费者测试缺少本地 Octop 路径时会提前返回，不能全部作为契约通过证据   |
| 原始消费者握手函数 | 接受当前服务生成的握手                            | 不代表 OAuth、卡片和浏览器全链路通过                                      |
| 用户凭证路由探针   | /tickets 返回 403 CREDENTIAL_NOT_ACCEPTED         | 使用原生 Auth 中间件及受控 issued-credential resolver，未连接真实 Casdoor |
| 默认业务检查器     | 无真实授权时，非空 permissionRef 仍返回允许       | 生产 Provider 未注入真实业务授权检查器                                    |
| 撤销后保存探针     | 绑定撤销且连接停用后，已有 embed 仍可保存         | 使用真实 SQLite 服务测试；需补模板 HTTP 回归                              |
| 异常状态探针       | FAILED／UNKNOWN 提交后，getInteraction 返回 draft | 两种分支均复现，权威查询状态不一致                                        |

**当前结论：Gate A 尚未达到。** 现有测试通过数量不能替代下述功能缺口和场景验收。

### 3.3 剩余功能总表

| 需求 ID | 功能                             | 优先级              | 交付门槛                         | 对应既有修复项                    |
| ------- | -------------------------------- | ------------------- | -------------------------------- | --------------------------------- |
| NEXT-01 | 用户凭证路由与真实原生业务授权   | P0                  | A                                | FIX-06、FIX-08                    |
| NEXT-02 | Casdoor 浏览器首登与身份关联     | P0                  | A 受控验证；B 真实复测           | FIX-02、FIX-03、FIX-13            |
| NEXT-03 | 撤销、版本及历史票据失效         | P0                  | A；B 多实例复测                  | FIX-07、FIX-13、FIX-15            |
| NEXT-04 | 权威异常回执与操作恢复           | P0                  | A；B 卡片与故障复测              | FIX-09、FIX-10、FIX-12            |
| NEXT-05 | IAM 快照、授权所有权和绑定唯一性 | P1，Gate A 必须关闭 | A；B 目标数据库及真实 token 复测 | FIX-13、FIX-14、FIX-15            |
| NEXT-06 | 真实应用回归与 Gate A 证据       | P1，Gate A 必须关闭 | A                                | FIX-01、FIX-02 及 R01–R42 的 A 项 |
| NEXT-07 | 控制面集成管理页面               | P1                  | B；管理 API 边界在 A 验证        | FIX-16                            |
| NEXT-08 | 真实环境联合验收与交付           | P1                  | B                                | FIX-16 及 R01–R42 的 B 项         |

优先级决定开发顺序，不表示 P1 可以跳过后直接宣布联调或最终验收通过。

## 4. 角色、架构和授权原则

### 4.1 角色与允许行为

| 角色         | 应有能力                                         | 边界                                           |
| ------------ | ------------------------------------------------ | ---------------------------------------------- |
| 平台管理员   | 管理 IdP、准入、映射、连接、密钥、表单及运行配置 | 经原生授权显式授予，不因登录自动获得           |
| 集成运维人员 | 按配置运行同步、查看连接状态、查询操作及审计     | 不自动获得密钥管理、授权映射修改或业务读写能力 |
| 发布人员     | 进入 Releases 页面并操作获授权 App               | 页面可见与具体 App 操作分别检查                |
| 通用表单用户 | 打开被授权表单、保存、提交、查看本人或被授权记录 | 每个动作和记录范围由原生 Authorization 决定    |
| 审计查看人员 | 只读访问授权范围内的运行与审计信息               | 不获取明文凭据，不借审计接口读取无权业务摘要   |

角色名是产品职责描述；实施时复用现有 Permission Sets 和 settings/resource/action 权限项。禁止把 Casdoor 的任意 group 字符串直接当作本地 root 或任意权限集名称执行。

### 4.2 组件职责

| 组件                     | 负责                                   | 不承担                              |
| ------------------------ | -------------------------------------- | ----------------------------------- |
| Casdoor                  | 用户身份、受信 token、目录事实         | NocoBase 记录级业务授权             |
| Identity Adapter         | 验证身份、准入、稳定关联、受控目录同步 | 默认给所有已登录用户授予业务权限    |
| 原生 Auth／Authorization | 会话、凭证准入、权限集、资源及记录判断 | 依赖前端按钮判断服务器权限          |
| Business UI Adapter      | 协议转换、注册表、票据、操作和权威回执 | 自建绕过原生授权的第二套业务 ACL    |
| Control／App Host        | 集成管理、发布、运行和审计入口         | 将业务容器直接变成控制面管理员      |
| Octop 现有插件           | 交互卡片、嵌入表单、拉取权威状态       | 把前端 postMessage 当作提交成功证据 |

### 4.3 所有业务动作的必要条件

服务器对出票、兑票、保存、提交、查看、查询、重试分别检查适用的条件：

1. 当前 App／connection 正确且启用。
2. 用户来自原生认证上下文，账号及受信 Provider 当前有效。
3. Octop issuer＋subject 与当前本地身份的有效绑定一致。
4. 票据／embed 的版本、动作、表单、记录、TTL 和连接约束有效。
5. 当前原生授权允许该资源、动作、记录及可写字段。
6. 目录快照与授权新鲜度满足本 PRD 的策略。
7. 操作状态、幂等键和版本允许执行该动作。

缺失条件失败关闭；不能通过“有 ticket”“已登录”或“permissionRef 有值”推导业务允许。

## 5. NEXT-01：用户凭证路由与原生业务授权

### 5.1 目标行为

合法 Casdoor 资源凭证能够访问明确声明的协议路由。身份已认证但没有业务授权的用户获得拒绝；已授权用户只能操作允许的通用类型、动作和记录。

### 5.2 用户凭证路由

- 为应接受 Casdoor 用户凭证的协议路由补齐原生 security 声明与对应准入策略，使用 casdoorAccessToken 及现有 auth.required 链路。
- 声明、运行时路由策略和接口文档保持一致；不通过全局策略允许所有路由接受外部 token。
- 不把 scopedKeys: true 视为已经声明允许 Casdoor issued credential。
- service secret 只用于固定协议允许的连接级动作；不得代替用户身份创建或操作单据。
- 错 issuer、audience、签名、有效期、停用 Provider、禁用用户或不符合资源 token 策略的凭证必须拒绝。
- 启用集成但缺少必要受信配置时，提供可诊断错误并拒绝开放集成入口。

| 路由类别                                 | 认证来源                     | 必要校验                                      |
| ---------------------------------------- | ---------------------------- | --------------------------------------------- |
| handshake、OAuth consume                 | 对应连接服务凭据             | 连接隔离、启用状态、一次消费及协议约束        |
| OAuth callback                           | 已保存的受控授权状态         | state、连接、过期和重放；不得直接建立业务授权 |
| tickets、interactions、operations、retry | 原生 Auth 接受的用户资源凭证 | 当前用户、主体绑定、当前原生授权              |
| tickets/redeem                           | 一次性 ticket＋nonce         | 当前状态和版本重新验证后建立受限 embed        |
| documents/save、documents/submit         | 原生会话及对应 embed 上下文  | 动作、记录、字段、版本和当前授权              |
| 管理 API                                 | 原生管理员／受委派管理会话   | 对应 settings／resource 权限，先授权后查询    |

路径及 HTTP 方法沿用固定消费者契约，不为本表新增替代协议。

### 5.3 注入真实业务检查器

- 在生产 Provider 中注入基于原生 Authorization 的业务检查器，使用当前用户和有效权限事实。
- 未配置检查器时默认拒绝全部业务动作；删除“permissionRef 非空即允许”的默认行为。
- permissionRef 必须能够解析为本地受支持资源／动作，未知或非法引用拒绝。
- 出票、保存、提交、详情、交互查询、操作查询和重试均调用授权检查；包含具体 recordId 和归属约束。
- 查询和重试必须从真实 operation／interaction／form 恢复资源范围，移除固定 generic.request:edit 等不能表达实际目标的硬编码。
- 只读动作不能自动获得写权限；客户端字段、owner、状态、版本和系统编号的写入边界由服务器限定。
- 修改或撤销 Permission Set 后，下一个相关请求按新权限判断；权限缓存必须有可验证的失效机制。

### 5.4 验收

合法资源 token 成功访问指定路由，未声明路由仍拒绝该凭证。同一用户分别验证有授权、无授权、撤权、跨记录、越权字段和服务密钥冒充。测试必须经过实际模板 HTTP，不仅调用注入 allowlist 的 service。

## 6. NEXT-02：Casdoor 浏览器首登与稳定身份关联

### 6.1 目标行为

用户从 Control 或通用 Demo 的 Casdoor 登录入口完成首登；准入通过后建立唯一的原生用户、OAuth account 和 external identity，再发放有效会话。重复登录保持同一本地用户。

### 6.2 登录及关联流程

1. 应用发起受控 OIDC authorization code＋PKCE 流程，保存可校验 state、回调和连接上下文。
2. 使用原生支持接口验证回调、code 和 IdP 身份；对适用的 OIDC nonce、issuer、audience 等执行规范校验。
3. 在发放有效应用会话前判断 Provider 启用、用户状态及准入策略。
4. 以已验证的 issuer＋subject 查找或创建稳定身份关联。
5. 通过原生认证扩展／管理能力创建或关联 account、本地 user 与 externalIdentities。
6. 全部必要步骤成功后建立原生 Session；失败不得留下可用业务会话。
7. 重复及并发回调复用已完成关联，不能创建第二个用户或不一致 account。

保留禁止按邮箱隐式合并的边界。邮箱相同但 subject 不同，拒绝自动归并并提供可解释处理结果。

### 6.3 一致性与恢复

- JWT 首次访问先创建用户、随后浏览器登录，必须关联原用户。
- 浏览器先登录、随后 JWT 访问，必须命中同一 issuer＋subject 与本地用户。
- 使用原生支持 API，不通过手工插入认证表绕过认证生命周期。
- 如跨组件写入不能同事务完成，使用唯一约束、可恢复关联状态和会话门控；未完成关联不作为授权依据。
- 不能仅关闭 disableImplicitSignUp 来绕过准入，也不能仅增加登录按钮就认定首登已交付。
- 账号、Provider 停用后拒绝新登录，并按原生能力撤销已有会话；重新启用不恢复旧会话。
- 保留受控本地管理员恢复入口及操作说明。

### 6.4 验收

Gate A 通过受控 OIDC 服务执行真实浏览器／HTTP 回调链：首次、重复、并发、两种登录顺序、同邮箱不同主体、准入拒绝、错误或过期回调、重放、账号禁用。Gate B 用真实 Casdoor Client 和准确 Redirect URI 复测。

## 7. NEXT-03：撤销、版本与历史凭证失效

### 7.1 目标行为

出票或兑票后发生停用、撤销、改绑或权限收回，相关旧票据与 embed 不再允许新业务访问。绑定重新启用时不能复活旧票据或上下文。

### 7.2 真实版本与生命周期

- 为有效主体绑定设置单调变化的 revision 或等价授权版本；绑定 ID 不等于 revision。
- 绑定撤销、改绑、重新启用等安全状态变化推进版本；票据和 embed 保存签发时版本。
- 根据实现对连接和表单使用配置版本或等价失效机制，确保关键安全配置变化可撤销旧上下文。
- 兑票检查 nonce、主体、连接、TTL、动作、表单、绑定版本及当前授权。
- 保存、提交、详情、交互查询、操作查询和重试重新判断适用的当前安全状态；不能仅验证 embed 的 userId、sessionRef 和到期时间。
- Provider、用户或绑定的撤销传播至相关上下文；多实例不得仅依靠单进程内存标记。
- 已在事务中提交成功的操作不因后来撤销而改写为失败；撤销后新的受保护响应不继续披露无权摘要。

并发撤销与写入必须有明确授权线性化边界：撤销已提交后开始的新业务操作不得成功；已经进入提交边界的并发操作按数据库锁／条件更新策略确定结果并可审计，不承诺撤销历史已发生的副作用。

### 7.3 存量升级

增加新的、排序在现有迁移之后的迁移或等效升级步骤：

1. 作废缺少 nonce、真实 revision 或完整动作约束的历史未消费票据。
2. 作废无法可靠关联新安全版本的旧 embed，要求用户重新打开表单。
3. 不允许 nullable 历史字段通过“字段为空就跳过检查”继续放行。
4. 保留正式单据、历史 operation、receipt 和归属审计。
5. 输出异常绑定或历史数据报告；不任意重写 owner 或删除业务记录。
6. 记录升级导致重新授权／重新打开的用户提示和运维操作。

不得原地修改已合并迁移的内容、名称或校验和。

### 7.4 验收

覆盖出票后撤销、兑票后撤销、停用连接、停用 Provider、禁用账号、修改绑定、重新启用及 App 重启；保存、提交、详情和查询按当前策略拒绝。空库与带旧票据／embed 的升级库均需测试。

## 8. NEXT-04：权威异常回执与恢复

### 8.1 目标行为

提交响应、交互查询、操作查询和 Octop 卡片消费同一份权威状态。FAILED、UNKNOWN、BUSINESS_REJECTED 不得因缺少 latestReceiptId 回退为 draft，也不能返回上一次提交成功的旧回执。

### 8.2 统一结果模型

沿用既有字段和协议值，由统一 DTO 生成 snake_case 与 camelCase 别名。至少保存并返回：

- interaction_id、operation_id、真实 form_ref／document_type。
- record_id、record_version、receipt_sequence；正式记录未创建时 record_id 为 null。
- result.type、result.status、code、message、disclosable。
- safe_retry、idempotent、side_effect；未知副作用允许 null。
- allowed_actions／allowedActions，按当前状态和当前权限生成。
- 可披露 summary、navigation；无权内容不能因历史缓存字段重新返回。

读取成功与业务提交成功分别表达：success 表示读取请求结果的用法必须符合固定消费者，不得由 success: true 推断正式提交成功。草稿查询不附带提交 SUCCESS 结果。

| 业务事实       | 权威结果                 | 允许动作原则                               |
| -------------- | ------------------------ | ------------------------------------------ |
| 未提交草稿     | draft，无提交 SUCCESS    | 按授权 save／submit；正式 recordId 为 null |
| 正式成功       | SUCCESS／SUCCESS         | 按授权查看详情、关闭；不得重复提交         |
| 业务拒绝       | BUSINESS_REJECTED        | 仅返回可披露原因及合法后续动作             |
| 确认技术失败   | TECHNICAL_ERROR／FAILED  | 只有确认安全且当前有权限时允许 retry       |
| 结果未知       | TECHNICAL_ERROR／UNKNOWN | 允许 query_status；禁止 submit 和 retry    |
| UNKNOWN 已查明 | 原操作更新为已证实结果   | 新 sequence；不生成第二份业务记录          |

动作字符串、状态映射和消费者按钮均以固定 Octop 协议验证，不能只在适配器内部定义一套同名状态。

### 8.3 所有结果持久化

- 成功、拒绝、FAILED、UNKNOWN 及恢复均持久化权威结果和可恢复 latest 关联。
- 正式业务成功、operation 成功、成功 receipt 和 latest 指针同库事务提交。
- 无业务写入的拒绝／FAILED 使用明确的结果持久化事务；失败可恢复，不能永久只存在于 HTTP 响应。
- getInteraction 和 queryOperation 从同一权威状态投影，字段、动作、recordId 和 sequence 一致。
- sequence 对状态变化单调递增；重复读取不产生新业务副作用，旧结果不得覆盖新状态。
- 草稿读取返回真实草稿版本，不能固定 record_version 为 0 掩盖已保存数据。
- 业务记录存在时不得将 recordId 改成失败标识或无理由置空。

### 8.4 FAILED 安全重试

重试必须同时满足：原操作 FAILED、结果允许 safe_retry、无已完成副作用或有可靠幂等保护、当前用户仍有权限且上下文有效。

重试绑定原 operation 和 interaction，记录 attempt／因果关系；保留正式提交幂等约束，不通过删除旧 operation 或幂等键来重试。并发重试最多产生一份正式单据。

UNKNOWN、成功、已确认存在不允许重复的副作用、撤权和过期上下文，均不能借 retry 绕过。

### 8.5 UNKNOWN 恢复与丢响应

- 在副作用前确定稳定 operationId；首次提交响应和首次回执均丢失时，能通过既有 interaction 查询恢复关联。
- UNKNOWN 只查询或由恢复器对账；不自动重发业务 submit。
- 恢复器只按可证明的业务事务、幂等记录、attempt 和结果事实改状态。
- 能证明未执行时才确认为 FAILED；仍无法确认时保持 UNKNOWN。
- 单纯存在 receipt 不能视为成功，必须核对结果类型和操作关联。
- 必须测试数据库 COMMIT 成功后丢弃响应，而非仅在写入前直接返回 UNKNOWN。
- 恢复器遵守应用生命周期；多实例执行使用原生调度／锁／任务机制或可证明的数据库并发控制。启停不能遗留重复任务。

### 8.6 前端消息

表单 postMessage 只提示刷新，带正确 interaction、nonce 和批准 targetOrigin；不得作为权威成功来源。消息丢失或伪造不改变服务器结果，原插件拉取和历史恢复继续有效。

## 9. NEXT-05：IAM 一致性与资源凭证策略

### 9.1 目录快照与授权新鲜度

- 首次 JIT 可在明确准入策略下使用已验证 token 初始化；首次目录对账后进入目录权威模式。
- 已同步身份的权限映射只使用当前目录快照，旧 JWT 的 groups 不得重新授予目录已经撤销的权限。
- 保存快照观测时间与授权版本或等价事实，明确显示正常、过期、缺失、同步失败状态。
- 默认目标采用同步周期 5 分钟、快照可接受期限 10 分钟；配置可以调整，但启用时校验二者关系。
- 本期默认策略：目录权威身份的快照过期／缺失时，不发放新的有效集成会话，不签发新业务票据，不接受保存、提交和重试，不进行权限升级。
- 对已存在会话，至少对上述操作执行实时新鲜度门控；不得只在登录时阻断。
- 只读操作不以过期快照新增权限，必须检查当前原生权限、连接和绑定；无权时不返回摘要。
- 提供管理员同步／对账入口和可解释错误；恢复成功后按新事实重新验证，不恢复已撤销旧凭证。
- 控制面本地恢复管理员不依赖远端目录可用性，其权限仍由本地原生授权控制。

该策略约束集成访问，不把本项目扩展成全站所有本地用户的统一离线认证改造。

### 9.2 权限 assignment 所有权

- IAM 只撤销它实际创建且当前 assignmentId 仍一致的授权。
- 同一个 Permission Set 上存在旧 managed row，不足以证明当前 assignment 归 IAM 所有。
- 多规则共享前，必须验证真实 assignmentId 与受管归属匹配。
- 管理员删除 IAM 授权并人工新建后，新授权不能被旧规则或另一规则认领。
- 规则 A 转规则 B、随后移除所有规则，人工授权仍保留。
- 真正由 IAM 创建的共享授权，最后一个有效规则退出时才回收。
- 清理过期 managed 跟踪时保留审计，不撤销人工 assignment。

### 9.3 有效主体绑定唯一性

同一 connection 内同时满足：

1. 一个有效 Octop issuer＋subject 只关联一个本地用户。
2. 一个本地用户只有一个有效 Octop 主体绑定。
3. 历史撤销记录可保留，不作为当前有效绑定使用。

通过数据库唯一约束、当前有效占位表及事务，或经验证的等价方案保证。不能只在 preview 或同一进程中检查。

不同 subject 并发绑定同一个 localUserId，必须最多一个成功；撤销／重绑与占位、revision、审计原子一致。导入提交重新验证 preview 结果，不能信任过期预览。

### 9.4 资源 token 策略

- 保留签名、受信 issuer、明确 audience、有效期、账号和 Provider 校验。
- 根据真实 Casdoor 配置冻结 client／resource／scope／purpose 的可验证规则，不臆造固定 typ 值。
- 仅用于登录的 ID token 不应因为具有相似签名和 aud 就被自动接受为业务资源凭证。
- Gate A 使用受控 token 矩阵验证已实现规则；Gate B 用真实 Casdoor token 与 Client 配置核对。
- 若现场不能可靠区分 ID token 与资源凭证，使用授权服务器支持的资源配置／验证方式解决；未解决前 Gate B 阻断。
- 缺少必要配置失败关闭，禁止为“先联调”放宽成任意签名 JWT 均可访问。

## 10. NEXT-06：真实应用回归与 Gate A 证据

### 10.1 应用测试必须经过真实装配

Control 和 Integration Demo 以真实 Application 初始化、迁移、Provider、路由、Auth 和 Authorization 启动。执行原始 HTTP 请求，不能只检查插件名称列表或直接传 userId 调用 service。

允许受控 OIDC／JWKS 和隔离数据库；不允许同时伪造认证结果、业务授权和数据库，再将结果称为端到端。

### 10.2 固定消费者 fixture

- 固定 Octop 提交 SHA，并记录来源文件、版本和完整性摘要。
- 通过仓库内受许可 fixture 或确定性的依赖准备取得原始握手／回执消费实现。
- 删除 D:/git_ai/... 等个人机器路径依赖。
- 缺失消费者、Python 或其他必要工具时明确失败，或将该项标为 NOT RUN 并阻断 Gate A；不得无断言 return 后显示通过。
- 同时验证正例和负例：缺失能力、错误字段、异常回执、动作限制和旧 sequence。
- 不复制简化解析器替代真实消费者并据此宣布兼容。

### 10.3 构建与执行记录

四个目标包分别执行 lint、typecheck、test、build；先满足仓库构建依赖。每项保留命令、完整提交、运行环境、退出码和输出。

```bash
pnpm install --frozen-lockfile

pnpm --filter @nocobase/app-plugin-casdoor-identity lint
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck
pnpm --filter @nocobase/app-plugin-casdoor-identity test
pnpm --filter @nocobase/app-plugin-casdoor-identity build

pnpm --filter @nocobase/app-plugin-business-ui-adapter lint
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter build

pnpm --filter @nocobase/app-template-smc-control lint
pnpm --filter @nocobase/app-template-smc-control typecheck
pnpm --filter @nocobase/app-template-smc-control test
pnpm --filter @nocobase/app-template-smc-control build

pnpm --filter @nocobase/app-template-integration-demo lint
pnpm --filter @nocobase/app-template-integration-demo typecheck
pnpm --filter @nocobase/app-template-integration-demo test
pnpm --filter @nocobase/app-template-integration-demo build
```

命令按实施提交的实际 package scripts 校验；不能将 lint typecheck test build 写在一次脚本调用后当作四项检查。原生扩展或生命周期脚本如需分步构建，应逐项记录；--ignore-scripts 的安装不单独作为完整环境交付证据。

需要数据库的测试按仓库隔离与串行规则运行，不共享可被并发清空的数据库。浏览器入口不得用 --pass-with-no-tests 将零用例执行标为通过。

### 10.4 Gate A 报告修订

重审现有报告中 R02、R03、R04、R09、R15、R16、R17、R22–R26、R31–R34、R39 等条目，并按实际证据修订；具体以完整 R01–R42 回归为准。

状态统一为 PASS、FAIL、PARTIAL、NOT RUN、BLOCKED。源码存在仅能记为实现证据，不能直接标运行验收 PASS。保留旧报告和修订原因，不无记录地覆盖原结论。

## 11. NEXT-07：控制面集成管理功能

### 11.1 页面与必要操作

| 页面           | 必须展示                                                    | 必须支持的操作与边界                                    |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| IdP／准入      | issuer、Client 标识、启用状态、准入条件、配置校验结果       | 按权限配置与启停；Secret 使用原生受保护引用，不回显明文 |
| 同步与目录状态 | 最近成功／失败时间、快照新鲜度、运行状态、错误摘要          | 手动同步／对账、查看历史；重复操作受并发保护            |
| 权限映射       | 条件、目标 Permission Set、启用状态、影响预览               | 仅映射允许清单；展示人工／IAM 归属；变更审计            |
| 主体绑定       | 连接、Octop 主体、本地身份、状态、revision                  | 导入预览、冲突说明、提交、撤销／重绑；提交重新校验      |
| Adapter 连接   | connectionId、批准 Origin、公开地址、启用状态、握手健康     | 配置、启停、密钥轮换；轮换后行为有明确证据              |
| 表单注册       | formRef、类型、schema 版本、权限引用、启用状态              | 注册／更新受支持元数据、筛选分页；不新增表单设计器      |
| 操作与回执     | interaction／operation、状态、attempt、sequence、副作用事实 | 授权查询、对账；未知不能人工一键改成成功                |
| 审计与诊断     | 操作者、动作、目标、授权结论、结果、关联 ID、时间           | 分页和筛选；错误脱敏，不披露凭据或越权业务内容          |

管理页面复用当前组件与原生导航规范，遵守仓库前端约束。配置属于文件、部署变量或 Secret 管理的，应由页面提供相应受支持的读取／校验／更新流程，明确是否需要重载；不能做“保存成功但未生效”的假编辑。

### 11.2 权限及交互要求

- 页面可见、API 访问及具体操作分别授权，直接构造 API 请求同样受保护。
- 禁用、撤销、重绑、映射变更和密钥轮换显示影响范围及操作结果。
- 长任务返回运行 ID 与状态，不用前端请求超时推断任务失败。
- 列表返回真实数据，支持分页、筛选及空态；权限收回后不能保留可继续读取的接口路径。
- 错误提示区分凭证失效、无权限、配置不全、快照过期、版本冲突和结果未知；不展示堆栈或 Secret。
- Users／Permission Sets 原生入口保持可用；不得自动向所有 authenticated 用户授予集成或发布权限。

### 11.3 Releases 权限复测

非 root 发布人员同时满足页面访问和关联 App 操作权限。验证实际页面，以及关联 App 允许／非关联 App 拒绝的 API；仅测试列表返回 200／403 不足以证明完整范围隔离。

Gate A 可由已授权 API 完成初始化，管理 API 和 Releases 安全边界必须已验证；本节完整管理页面在 Gate B 完成交付。

## 12. NEXT-08：真实现场联调与交付

### 12.1 环境输入及记录

| 输入       | 交付要求                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| Casdoor    | 真实 issuer、Client、精确 Redirect URI、资源 audience／scope、目录接口及最小权限凭据 |
| NocoBase   | 合并提交、制品版本、Control 与 Demo 地址、独立 Secret／加密密钥配置                  |
| Octop      | 固定目标 SHA／安装包、Business UI 插件版本、连接注册、批准 Origin 与私网例外         |
| 浏览器     | 目标 Chrome／Edge 及版本，记录 Cookie 策略                                           |
| Host       | 通用 Demo 的 in-process 和 Docker 测试实例、base path、网络与生命周期配置            |
| 数据库     | 目标 PostgreSQL 版本与隔离测试库；SQLite 本地回归结果                                |
| TLS 与恢复 | HTTPS／CA 配置、备份位置、恢复隔离环境及轮换方案                                     |

缺少输入时标记具体 BLOCKED 及受影响用例；配置存在但代码无法处理的，记录为代码 FAIL，不能统称环境待准备。

### 12.2 A–F 通用场景

A–F 在主通用 Demo、同一用户下完成；第二个 Demo 实例用于另一 Host 模式、生命周期和隔离验证。

| 场景                 | 操作                           | 必须结果                                                |
| -------------------- | ------------------------------ | ------------------------------------------------------- |
| A 成功               | 新建、保存、提交、打开详情     | 保存仍草稿；一份正式记录；原卡片更新；详情真实且只读    |
| B 新建被拒绝         | 同一用户尝试无权通用类型       | 无正式编号和业务副作用；按协议返回可披露拒绝            |
| C 后续动作被拒绝     | 对合法既有记录执行无权动作     | 保留原 recordId 和原记录；不伪造新记录                  |
| D 确认失败           | 写入前注入可确认无副作用故障   | FAILED，可安全重试时才显示 retry；重试后最多一份记录    |
| E 响应丢失           | 事务提交成功后代理丢弃响应     | 客户端未知；查询原 operation 恢复 SUCCESS；无二次提交   |
| F 继续未知后确认失败 | 暂无法确认，随后对账证实未完成 | UNKNOWN 期间只查询；证实后 FAILED；历史重开读取最新结果 |

### 12.3 现场专项

- 真 Casdoor 首登、重复、两种身份路径、停用及目录删组后的旧 token。
- 真 Octop OAuth code＋PKCE、连接隔离、表单兑票、回执卡片、query_status、retry 和历史恢复。
- HTTPS iframe 的 Cookie、SameSite／Secure、CSP frame-ancestors、Origin／CSRF、postMessage 来源与 nonce。
- 正确 App base path、多 connection publicBaseUrl 和跨连接拒绝。
- in-process／Docker 启停、重启及对账；进程结束后任务和连接释放。
- PostgreSQL 唯一性、并发、迁移升级和故障恢复。
- 备份恢复保留身份、绑定、权限归属、正式记录、operation／receipt 关系及密钥可用性。
- 密钥轮换同时验证新凭据生效、旧凭据按策略失效，以及支持窗口内密文解密行为。
- 生产关闭故障入口；日志、截图和报告不含 token、Cookie、code、PKCE verifier、ticket 或 Secret。

不以关闭浏览器安全策略、跳过 TLS 验证或放宽所有 Origin 作为通过条件。未测浏览器／设备明确不承诺兼容。

## 13. 数据、迁移与运行约束

### 13.1 需要落实的数据事实

以下是数据语义要求，不强制具体表名或新增同名 API。

| 对象          | 必须保存／保证的事实                                    |
| ------------- | ------------------------------------------------------- |
| 主体绑定      | 有效占位唯一性、真实 revision、变更与撤销审计           |
| ticket        | 一次消费、nonce、连接／主体、动作、记录、版本及 TTL     |
| embed         | 原生会话关联、真实绑定版本、表单／记录／动作和有效期    |
| identity 快照 | 目录属性、观测时间、权威模式与授权版本／等价事实        |
| 受管权限      | 当前真实 assignmentId、规则引用和所有权来源             |
| interaction   | 稳定提交关联、真实草稿版本、最新权威状态                |
| operation     | 幂等摘要、attempt、状态、副作用事实、结果及恢复依据     |
| receipt       | 所有结果类别、可空正式 ID、单调 sequence 和 latest 关联 |
| 审计          | 操作者、目标、动作、授权结论、结果、关联 ID 与 UTC 时间 |

### 13.2 迁移验证

必须验证空库安装、从 f9306244 数据库升级、带旧安全字段的更早版本升级，以及支持的 up／down／up 或明确的备份恢复路径。

- 已合并迁移保持不变。
- 正式业务记录、历史成功结果和归属不能丢失。
- 重复有效绑定必须报错或输出待处理报告，不自动任选一条成为新 owner。
- schema down 不被描述为自动恢复旧凭证或旧权限。
- 已知不安全凭证在代码回退时也不能重新可用；必要时关闭集成入口并使用已验证备份恢复。
- 数据库和加密密钥共同纳入备份；恢复验证实际解密，不仅检查文件存在。

### 13.3 审计与错误

关键事件包括登录准入、绑定变更、同步、映射授予／撤销、人工授权保护、出票／兑票、拒绝、重试、对账、配置启停、轮换及发布操作。

每条关联适用的 requestId、appId、connectionId、localUserId、externalIdentityId、interactionId、operationId、recordId、assignmentId／revision。错误码应稳定、可解释且由测试覆盖；不强制重命名已经符合要求的既有错误码。

## 14. 增量验收用例

以下 N01–N36 是本轮必须新增或加强的用例。它们补充既有 R01–R42，不替代旧矩阵；原有通过项仍需按改动范围回归。A/B 表示受控环境验证后在真实现场复测，不能任选其一。

| ID  | 对应需求   | 场景与必须断言                                                                                        | Gate            |
| --- | ---------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| N01 | NEXT-01    | 真实模板 HTTP 携带受控签发的合法资源 token，出票及必要用户路由成功；无 CREDENTIAL_NOT_ACCEPTED 误拒绝 | A/B             |
| N02 | NEXT-01    | 未声明路由继续拒绝 Casdoor issued credential，服务密钥不能冒充用户                                    | A               |
| N03 | NEXT-01    | 生产检查器未接入／无 Permission Set 时默认拒绝；非空 permissionRef 不产生授权                         | A               |
| N04 | NEXT-01    | 同一用户允许资源成功、拒绝资源失败；跨记录和越权字段无写入                                            | A/B             |
| N05 | NEXT-01    | interaction／operation 查询和 retry 从真实目标恢复权限范围，无固定编辑资源绕过                        | A               |
| N06 | NEXT-01/03 | 权限撤销后下一个受保护请求拒绝，多个实例不继续使用陈旧允许缓存                                        | A/B             |
| N07 | NEXT-02    | 受控 OIDC 首登建立唯一 user、account、external identity 和有效 Session                                | A/B             |
| N08 | NEXT-02    | 重复与并发首登、JWT 先／浏览器先，均命中同一本地用户                                                  | A/B             |
| N09 | NEXT-02    | 同邮箱不同 subject、准入拒绝、回调重放／过期／错误 state，不产生有效业务会话                          | A/B             |
| N10 | NEXT-02/03 | 账号及 Provider 停用拒绝新访问并失效会话；重新启用不恢复旧会话                                        | A/B             |
| N11 | NEXT-03    | 出票后撤销／重新启用／改绑，旧 ticket 均不能兑票                                                      | A               |
| N12 | NEXT-03    | 兑票后撤销绑定或停用连接，保存、提交和新受保护读取按策略拒绝                                          | A/B             |
| N13 | NEXT-03    | 绑定 ID 不变但 revision 已变，旧 ticket／embed 拒绝；跨连接和动作越界拒绝                             | A               |
| N14 | NEXT-03    | 原版本遗留 nullable 安全字段的票据和 embed 升级后失效；正式记录保留                                   | A               |
| N15 | NEXT-04    | failBeforeWrite 后提交／interaction／operation 均返回同一 FAILED、result 和安全动作                   | A/B             |
| N16 | NEXT-04    | UNKNOWN 在所有查询中保持一致且只允许 query_status，不回退 draft，不允许 retry                         | A/B             |
| N17 | NEXT-04    | 安全重试和并发重试最多一份正式单据，保留原操作关联与 attempt                                          | A/B             |
| N18 | NEXT-04    | COMMIT 后丢提交响应并丢首次回执，仍由 interaction 找回原 operation 并恢复成功                         | A/B             |
| N19 | NEXT-04    | 无法确认时保持 UNKNOWN；确认未执行才 FAILED；拒绝回执不能被恢复器当成功                               | A/B             |
| N20 | NEXT-04    | 旧 sequence 不覆盖新结果，旧成功不覆盖新失败；草稿查询版本真实且无提交 SUCCESS                        | A/B             |
| N21 | NEXT-05    | 目录删组同步撤权后继续使用有效旧 JWT，不重新授权                                                      | A/B             |
| N22 | NEXT-05    | 已目录权威身份快照过期时，新会话／出票／保存／提交／retry 失败关闭；恢复同步后重新校验                | A               |
| N23 | NEXT-05    | 人工替代 assignment 后规则 A→B→无规则，人工授权始终保留且不被认领                                     | A               |
| N24 | NEXT-05    | 真 IAM 多规则共享授权，最后引用退出才撤销；审计可还原来源                                             | A               |
| N25 | NEXT-05    | 不同 subject 并发绑定同一连接／用户最多一个成功；撤销重绑和预览过期不破坏约束                         | A；PG 于 B 复测 |
| N26 | NEXT-05    | 错 audience、缺／过期 exp、不受信 issuer、ID token、缺受信配置按规则拒绝                              | A/B             |
| N27 | NEXT-06    | 四包独立 lint／typecheck／test／build、完整安装前置通过；保留输出和退出码                             | A               |
| N28 | NEXT-06    | 真 Control／Demo 启动、迁移、Provider 和路由装配生效，执行原始 HTTP                                   | A               |
| N29 | NEXT-06    | 原始消费者握手及回执正负例执行；缺 fixture 不计通过；测试无个人绝对路径                               | A               |
| N30 | NEXT-06    | 报告逐项绑定 SHA／命令／环境／断言，PARTIAL 和 NOT RUN 不计 Gate 通过                                 | A/B             |
| N31 | NEXT-07    | 非 root 发布人员实际页面可进入，仅可操作关联 App，普通成员和非关联 App 被拒绝                         | A/B             |
| N32 | NEXT-07    | 本期管理页面真实读写、分页、状态及权限边界有效；直接 API 越权也拒绝                                   | B；API 边界于 A |
| N33 | NEXT-08    | 同一用户完整 A–F，经真实 Casdoor＋Octop；卡片、记录与操作状态一致                                     | B               |
| N34 | NEXT-08    | HTTPS iframe、目标浏览器、Origin／CSP／Cookie、多连接及 App base path 通过                            | B               |
| N35 | NEXT-08    | 双 Host 生命周期、PostgreSQL 升级／并发和恢复、重启后回执一致                                         | B               |
| N36 | NEXT-08    | 备份恢复、密钥轮换和生产故障入口关闭可验证；日志与证据脱敏                                            | B               |

拒绝测试除 HTTP 状态外，还需断言无业务副作用、无额外会话、无越权摘要或无重复记录等适用结果。

## 15. Gate 定义与放行规则

### 15.1 Gate A：联调准入

必须同时满足：

- NEXT-01–NEXT-06 对应的 A 项完成。
- 管理 API、原生管理入口和 Releases 权限边界达到 A 级验收。
- 既有 R01–R42 的全部 A 项，以及本轮 N 用例的 A 项，有可运行且通过的证据。
- 干净安装、四包检查、真实应用 HTTP、受控 OIDC／JWKS、数据库并发和消费者契约可复现。
- 本轮复现的 403 误拒绝、默认业务放行、撤销后可保存、FAILED／UNKNOWN 回 draft 均有回归关闭证据。
- 无剩余 P0，也无未关闭的 Gate A 必做 P1。
- 未执行的现场项明确列为 Gate B，不伪称已端到端通过。

通过后允许进入隔离现场联合测试。它不表示管理页面已全部交付或允许生产上线。

### 15.2 Gate B：本期最终验收

必须同时满足：

- Gate A 已通过，且证据对应本次交付提交／制品。
- NEXT-07 管理页面完成，NEXT-08 全部适用现场项通过。
- 真实 Casdoor 的身份与资源 token 策略明确、可验证。
- 同一用户 A–F、真实 Octop 卡片及目标浏览器通过。
- 双 Host、目标 PostgreSQL、升级、备份恢复与密钥轮换有证据。
- 本期必做项不存在 FAIL、PARTIAL、NOT RUN 或 BLOCKED。
- 部署、初始化、撤销、恢复、轮换和故障排查手册可执行。

缺少现场条件时保留明确阻断项，不把“环境未测”写成“默认通过”。本期最终验收也不替代组织的生产发布流程。

### 15.3 单项证据模板

| 字段       | 必填内容                                                        |
| ---------- | --------------------------------------------------------------- |
| 用例／需求 | Rxx／Nxx 与 NEXT-xx／FIX-xx                                     |
| 实现基线   | 完整 commit SHA、制品和迁移版本                                 |
| 环境       | Node／pnpm、数据库、App Host、浏览器；IdP／Octop 版本按用例填写 |
| 方法       | 命令、测试文件／断言、原始 HTTP 或浏览器步骤                    |
| 结果       | 退出码、脱敏响应、相关数据库事实或卡片证据                      |
| 边界       | 受控还是实际 IdP、service 还是 HTTP／浏览器、未覆盖内容         |
| 状态       | PASS／FAIL／PARTIAL／NOT RUN／BLOCKED                           |
| 未关闭项   | 原因、影响、负责职责与下一步                                    |

证据建议随代码保存在 prd/acceptance 的提交关联目录；采用仓库既有约定即可，无需建立新文档系统。

## 16. 实施批次与交付件

### 16.1 推荐批次

| 批次          | 工作                                                       | 退出条件                                               |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| M1 运行阻断   | NEXT-01、NEXT-03、NEXT-04，边修边补针对性 HTTP／数据库回归 | 用户凭证、真实授权、撤销和异常权威状态的已复现问题关闭 |
| M2 身份一致性 | NEXT-02、NEXT-05，补首登、快照、归属和并发测试             | 两条身份路径一致，IAM 边界及新增迁移通过               |
| M3 Gate A     | NEXT-06 及原有 A 项回归、管理 API／Releases 边界           | 完整证据支持 Gate A 放行                               |
| M4 产品与现场 | NEXT-07 管理页面、NEXT-08 现场验证                         | Gate B 通过，交付手册和恢复演练齐备                    |

管理页面可在 API 稳定后推进；环境准备可提前进行，但不得用现场调试代替尚未关闭的本地代码缺陷。

### 16.2 必须交付

1. 四个目标包及关联配置的实现代码，统一合入 develop/v3.0.1。
2. 新增数据库迁移、存量凭证失效处理和异常数据说明。
3. 真实 Auth／Authorization／HTTP、受控 OIDC、数据库及固定消费者测试。
4. 通用 Demo、隔离故障代理／夹具和 A–F 操作说明。
5. 本期控制面管理页面及权限配置说明。
6. 逐项修订的 R01–R42、N01–N36 验收报告。
7. Gate A 报告、Gate B 报告及真实未测／阻断项。
8. 部署初始化、准入与撤销、目录对账、UNKNOWN 恢复、备份恢复、密钥轮换和回退手册。

### 16.3 合并要求

PR 描述必须列明对应 NEXT／FIX／R／N、行为变化、迁移影响、实测命令及未完成事项。不得把“插件测试通过”作为所有功能完成的唯一说明。

仅合并文档不代表修复完成；仅合并代码不代表 Gate A／B 通过。已通过项目应附提交和回归证据，避免重复开发或覆盖。

## 17. 开工前检查与完成清单

### 17.1 开工前

- [ ] 核对最新 HEAD 与 f9306244 的差异，确认缺口是否已有后续修复。
- [ ] 阅读目标目录实际约束和 package scripts，确认使用 V3 扩展 API。
- [ ] 固定消费者 fixture、受控 OIDC 及数据库测试准备。
- [ ] 备份需要升级的测试数据和加密密钥，核对已有迁移顺序。
- [ ] 将 NEXT-01–NEXT-08 拆成可验收任务，并关联本文件用例。

### 17.2 Gate A 完成

- [ ] 合法用户凭证路由可用，未声明路由和服务密钥冒充被拒绝。
- [ ] 生产环境使用真实原生业务授权，缺检查器默认拒绝。
- [ ] 受控浏览器首登与 JWT 路径使用同一本地身份。
- [ ] 连接／Provider／账号／绑定／权限撤销有效，旧上下文不会复活。
- [ ] FAILED／UNKNOWN 等结果持久化并可由现有查询一致恢复。
- [ ] 快照过期策略、人工授权保护和有效主体数据库唯一性通过。
- [ ] 真实应用 HTTP、固定消费者及完整构建检查通过。
- [ ] 所有 A 项证据真实，无静默跳过或无断言通过。

### 17.3 Gate B 完成

- [ ] 本期管理页面、分页及直接 API 权限边界完整。
- [ ] 真实 Casdoor 和固定 Octop 全链路通过。
- [ ] 同一用户 A–F、HTTPS iframe 与目标浏览器通过。
- [ ] in-process／Docker、PostgreSQL、升级及恢复通过。
- [ ] 备份、密钥轮换、故障入口关闭和手册验证完成。
- [ ] 本期强制项无未关闭状态，交付提交与证据一致。
- [ ] 未引入 HR、CRM 或其他真实业务 App 范围。

## 附录 A：本轮复核代码定位

以下链接固定于本轮复核提交，便于复现当前问题；后续修复以新的提交和测试证据替换状态，不修改这些历史链接含义。

- [本轮修复合并提交 f9306244](https://github.com/smc-copilot/nocobase/commit/f930624436f78fd31dd1f8b4a00bda72564417ec)
- [协议用户凭证路由](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/routes/protocol.ts#L96)
- [默认业务检查器](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/business-access.ts#L51)
- [生产 Provider 的服务依赖](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/providers/business-ui-adapter.ts#L25)
- [Control OAuth 登录配置](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/templates/app-template-smc-control/server/config/auth.ts#L62)
- [embed 加载和当前状态检查](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L429)
- [异常提交分支](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1294)
- [交互状态及回执查询](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1555)
- [目录快照与权限重算](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-casdoor-identity/server/services/identity-provisioning.ts#L188)
- [跨映射规则的授权归属处理](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-casdoor-identity/server/services/permission-mapping.ts#L439)
- [当前消费者契约测试的本地路径依赖](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/packages/plugins/app-plugin-business-ui-adapter/tests/server/octop-handshake.test.ts#L13)
- [待修订的 Gate A 报告](https://github.com/smc-copilot/nocobase/blob/f930624436f78fd31dd1f8b4a00bda72564417ec/prd/acceptance/gate-a-report.md)
- [统一合并目标分支](https://github.com/smc-copilot/nocobase/tree/develop/v3.0.1)
