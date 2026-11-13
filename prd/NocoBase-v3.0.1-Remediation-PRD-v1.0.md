# SMC Enterprise Integration — NocoBase 联调阻断修复 PRD

> **文档版本：V1.0**  
> **日期：2026-11-13（北京时间）**  
> **开发仓库：smc-copilot/nocobase**  
> **合并目标：develop/v3.0.1**  
> **缺陷核查基线：6970c0766686fe2a92640b1d37711fc62a5ff5fd**  
> **Octop 消费者基线：64689a5b9863d974783f0605ed7673a7d5f73b22**  
> **性质：修复产品需求与验收规范，不代表代码已修复、测试已通过或允许上线。**

---

## 1. 修复目标与依据

### 1.1 本次目标

修复已合并的 NocoBase 控制面、Casdoor Identity、Business UI Adapter 和通用验证模板，使其从“模块代码存在”达到“可复现构建、真实应用已装配、协议兼容、权限边界有效，可以开始隔离环境联调”的状态；随后通过真实 Casdoor、Octop 插件和目标浏览器完成平台底座验收。

本项目继续复用 NocoBase V3 的 App Server、Hono、Better Auth、Authorization/Permission Sets、Releases 和 App Host，不重写这些内核能力。

### 1.2 文档关系

| 文档/来源                                                | 本次作用                                             |
| -------------------------------------------------------- | ---------------------------------------------------- |
| SMC-Enterprise-Integration-NocoBase-PRD-v1.2.md          | 原有范围、整体目标与最终交付要求                     |
| NocoBase-v3.0.1-Integration-Readiness-Review-20261113.md | B01–B10、I01–I05 缺陷、复现边界及代码证据            |
| 本修复 PRD                                               | 将缺陷转换为开发要求、迁移要求、测试与分阶段放行条件 |
| 固定提交的 Octop Business UI 插件及 protocol.md          | 外部消费者真实契约                                   |
| 用户提供的 Adapter 提示词附件                            | 仅参考对接协议，不作为本项目选型或范围约束           |

用户确认范围优先；同一版本下外部兼容行为以固定插件源码和协议文档为准。本修复 PRD 不推翻整体架构，不把参考 Adapter 夹具直接当作生产实现。

### 1.3 基线管理

编写本文时再次核对 develop/v3.0.1，分支头仍为上述 6970c076 提交。开工时先检查真实 HEAD 和未提交改动；若已更新，逐项判断缺陷是否仍存在，保留“已由其他提交修复”的证据，不重复覆盖他人修改。

修复在该开发分支的短期功能分支进行，建议命名 `fix/v3-smc-integration-readiness`，通过 PR 合回 `develop/v3.0.1`。所有修复统一汇入该目标分支；本文件的交付不包含实际创建分支、修改代码、提交或合并操作。

## 2. 范围、保留项与排除项

### 2.1 修复对象

1. `packages/templates/app-template-smc-control`：依赖、身份登录、Releases 权限和管理入口、运行配置。
2. `packages/templates/app-template-integration-demo`：实际插件组装、通用测试页面、迁移和环境配置。
3. `packages/plugins/app-plugin-casdoor-identity`：外部 token、准入、同步撤销、权限归属和主体绑定。
4. `packages/plugins/app-plugin-business-ui-adapter`：握手、OAuth 辅助、路由认证授权、票据、表单、状态及回执。
5. 关联 lockfile、配置、测试、迁移及 `prd/acceptance/` 证据文档。

### 2.2 保留的已有能力

保留 Control 的 Releases 前后端注册和 releasesAccessToken Provider；保留原生私有制品与 Secret 服务；保留 Casdoor 用户初始化、同邮箱拒绝隐式合并和原生账号禁用服务；保留 Adapter 原生会话创建与成功事务骨架。修复不是重新搭建一套控制面、身份中心或表单平台。

### 2.3 明确排除

- HR、CRM、财务实际 App、领域数据、业务报表、领域权限与数据导入。
- Octop 核心、Dashboard、聊天数据结构及既有插件协议变更。
- Casdoor 核心改造、新通用表单引擎和新工作流引擎。
- Adapter→Octop webhook/HMAC 回调、后端 patchResult 或自动唤醒模型。
- Agent 独立委托身份、自主提交业务与自动审批。
- 为绕开已有缺陷同时实现原生账号、PAT 等额外激活方式；本期必做仍为 Casdoor OAuth2。

### 2.4 修复与环境准备的区别

缺少现场 TLS、Client、Redirect URI、Registry 或目标浏览器配置属于部署输入；模板未注册、返回字段错误、只验登录不验权限属于代码缺陷。必须分别建任务，不能把代码阻断全部标记为“用户环境待确认”。

## 3. 两个验收门槛

| 门槛                 | 含义                                                                                                      | 允许的结论                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Gate A：联调准入     | 干净构建、真实 Application HTTP、消费者契约及本地安全/事务回归通过；使用受控 OIDC/JWKS 与测试数据库可复现 | 可以开始隔离现场的 Casdoor + Octop + 浏览器联调 |
| Gate B：修复最终验收 | Gate A 通过，且真实 Casdoor、目标 Octop、HTTPS iframe、A–F、双 Host 和恢复证据完整                        | 本期平台底座修复验收通过                        |

Gate A 不要求提前声称真实现场 E2E 已完成；Gate B 不能用纯服务测试、直接传 userId 调用函数或手工构造回执代替。Gate A/B 均不等同于生产上线审批或对所有浏览器的兼容承诺。

## 4. 缺陷到需求追踪矩阵

| 评审编号     | 问题                                       | 修复需求                       | 放行要求                             |
| ------------ | ------------------------------------------ | ------------------------------ | ------------------------------------ |
| B01          | lockfile 缺新模板 importer                 | FIX-01                         | Gate A                               |
| B02          | 应用未加载新插件，SSO 未衔接               | FIX-02、FIX-03                 | Gate A 本地流程；Gate B 真实 IdP     |
| B03          | 握手结构错误                               | FIX-04                         | Gate A                               |
| B04          | code 被哈希且没有返回 code                 | FIX-05                         | Gate A                               |
| B05          | 用户 token 未被路由允许                    | FIX-06                         | Gate A                               |
| B06          | form POST 兑票解析错误                     | FIX-07                         | Gate A                               |
| B07          | 回执/操作查询层级错误                      | FIX-09                         | Gate A                               |
| B08          | 管理与单据缺资源授权                       | FIX-06、FIX-08                 | Gate A                               |
| B09          | subject、nonce、撤销、action 约束缺失      | FIX-07、FIX-13、FIX-15         | Gate A                               |
| B10          | 详情、拒绝回执、安全重试与 UNKNOWN 不完整  | FIX-09、FIX-10、FIX-11、FIX-12 | Gate A 协议/数据库；Gate B 现场      |
| I01          | 停用 Provider 对已有身份放行               | FIX-13                         | Gate A                               |
| I02          | 旧 token 重新授予已同步撤销的权限          | FIX-13                         | Gate A                               |
| I03          | audience、exp、资源 token 规则不完整       | FIX-06、FIX-13                 | Gate A；Gate B 核对真实 token        |
| I04          | 认领并撤销人工重建的授权                   | FIX-14                         | Gate A                               |
| I05          | 主体唯一性未覆盖数据库并发                 | FIX-15                         | Gate A                               |
| 控制面补充项 | 管理入口、页面授权、表单列表及部署证据不足 | FIX-16                         | Gate A 核心管理可用；Gate B 完整交付 |

本文件中的 Gate 不是之前 P0–P4 开发阶段编号，防止将“P3 已提交”误当作测试通过。

## 5. FIX-01：可复现依赖与构建

### 5.1 产品行为

任何开发人员或 CI 使用固定提交、仓库声明的 Node/pnpm 和未预装依赖的工作目录，都可以冻结安装、构建两个插件和两个模板，不依赖开发者本机遗留 node_modules。

### 5.2 必做要求

- 同步两个新模板及变更包的 package.json、workspace 依赖和 pnpm-lock.yaml importer。
- 使用仓库声明的 pnpm 11.7.0 以及满足 engines 的具体 Node.js 版本；交付记录版本，不在修复期间顺手升级整仓工具链。
- 应用生产依赖完整声明实际运行需要的插件、驱动和共享 peer，不依赖自动 peer 安装掩盖缺失。
- 源码 Dockerfile 保留冻结安装；不能通过移除 frozen-lockfile 或忽略依赖错误使构建表面成功。
- 按实际目标数据库加入 PostgreSQL 驱动并验证；SQLite 可保留用于本地测试。

### 5.3 验收

干净目录执行冻结安装成功，之后相关包的 lint/typecheck/test/build 成功。Gate B 至少完成一次实际目标平台镜像构建和测试 App 部署。安装失败必须保留日志，不使用非冻结安装后将其结果标记为冻结安装通过。

## 6. FIX-02 / FIX-03：应用装配与 Casdoor 浏览器登录

### 6.1 各应用的最小注册矩阵

| 能力                                             | SMC Control                                          | Integration Demo                 |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------------------- |
| Authentication / Authorization / Users / Secrets | 保留                                                 | 保留                             |
| Releases / Host 管理                             | 必须                                                 | 不作为业务 App 必需能力          |
| Casdoor Identity                                 | 必须                                                 | 必须                             |
| Business UI Adapter                              | 默认无需承担单据服务；仅在明确验证其控制面页面时启用 | 必须，作为本期协议与表单验收服务 |
| 通用测试单据与表单                               | 不存放实际测试单据                                   | 必须                             |

评审发现两个应用都未注册 Adapter，不意味着必须把单据 Adapter 强行装进 Control。本次修复应按职责装配：Control 管发布与自身身份，Demo 管通用单据与协议。

### 6.2 应用启动要求

1. 依赖、服务端插件列表、配置 section、Provider 生命周期和迁移均注册到实际模板。
2. 按原生依赖顺序初始化：认证、授权及基础服务先于身份和 Adapter 的使用；不依赖偶然的全局变量初始化。
3. 无 IdP 配置时可保留受控本地管理员；启用企业集成后必填配置不完整必须明确失败，不降级为匿名或默认全准入。
4. 首次安装应用和从原缺陷版本升级应用均能执行正确迁移。
5. 从实际运行 Application/OpenAPI 证明路由已挂载，不以导出一个 createRouter 函数视为装配完成。

### 6.3 两条身份路径共用身份归属

- 浏览器：Casdoor OIDC → Better Auth Generic OAuth → 当前 App 原生 Session。
- Octop：PKCE 授权 → Adapter callback/consume → Casdoor token endpoint → 插件保存用户 Access Token → NocoBase 原生 issued credential。

两条链路均以受验证的 `issuer + subject` 对应同一 App 的本地用户。不能复制 Cookie、把 Access Token 当 Session，或按相同邮箱静默合并用户。

### 6.4 浏览器首登与准入

Generic OAuth 的客户端插件和登录入口必须接通；服务端通过安装版本支持的 hook/plugin/API，把经过协议验证的身份交给同一 provisioning/admission 服务。

**准入必须在发放有效业务会话之前完成。** 不能先允许创建/登录，再仅靠事后异步 hook 检查。`disableImplicitSignUp` 也不能被当作首次登录已实现：必须证明新获准用户能完成创建、account 关联、externalIdentities 绑定及 Session 建立。

若原生 account 与自有映射不能在同一事务内写入，必须用唯一约束、可恢复状态与会话发放门控保证：拒绝身份没有有效会话，失败重试不会重复用户，半完成关联不会变成授权依据。不得通过手工插入认证表代替原生支持接口。

### 6.5 验收

首次、重复、并发首登；同邮箱不同 Subject；准入拒绝；错误/过期/重放回调；账号禁用；本地管理员恢复路径；以及 JWT 先登录/浏览器先登录两种顺序，均指向同一稳定本地身份。Gate A 使用受控 OIDC 服务；Gate B 用真实 Casdoor 复测并记录 Claim、Audience 和 Redirect URI。

## 7. FIX-04 / FIX-05：握手与 OAuth code 交付

### 7.1 握手结构

`POST {base}/v1/handshake` 使用连接服务凭据，无单据副作用。所有 path 放在插件要求的顶层，`user_auth_methods` 只列已实现的 oauth2。示例为目标形状；真实能力尚未实现时不得提前置 true。

```json
{
  "protocol": "business-ui.v1",
  "ok": true,
  "kind": "business-ui-adapter",
  "service": { "name": "smc-nocobase-adapter", "environment": "test" },
  "auth": { "identity": "connection", "mode": "bearer" },
  "features": {
    "form_registry": true,
    "tickets": true,
    "receipts": true,
    "interactions": true,
    "user_auth_methods": ["oauth2"],
    "oauth_pkce_s256": true,
    "oauth_authorization_code": true,
    "receipt_schema_v11": true,
    "query_status": true,
    "safe_retry": true
  },
  "ticket_path": "/v1/tickets",
  "redeem_path": "/v1/tickets/redeem",
  "interaction_path": "/v1/interactions/{id}",
  "operation_path": "/v1/operations/{id}",
  "resolve_path": "/v1/forms/resolve",
  "save_path": "/v1/documents/save",
  "submit_path": "/v1/documents/submit"
}
```

`resolve_path` 保留兼容字段，但不发明尚未冻结的外部 resolve schema；服务端内部注册表必须真实工作。

### 7.2 OAuth 辅助链路

每连接独立 base 路径或 Origin，例如 `/business-ui/connections/site-a`。callback 路径确定连接，consume 的服务凭据只能消费同连接暂存项。不得根据请求 body 的 connection_id 切换连接。

- callback 保存原始 code 的**可解密密文**，使用原生 Secret 服务；state 保存摘要索引；建议 TTL 120 秒。
- consume 以原子条件更新或事务领取状态保证一次性；成功返回 `code` 原文给已鉴别的插件，未完成返回当前插件兼容的 pending。
- 日志、数据库普通列、异常及页面不得明文披露 code、verifier、token。
- 插件未向 Adapter 预注册 state，Adapter 不能宣称已验证 state 对某 Octop 用户的所有权；由插件的 pending state/PKCE 证明完成用户绑定。Adapter 负责连接隔离、限速、TTL 和消费防重放。
- 当前库内的 code_digest 无法恢复原始 code，升级时使旧暂存项失效，要求重新授权，不做“哈希还原”或继续消费。

成功消费示例：

```json
{ "code": "test-original-authorization-code" }
```

示例 code 只能用于隔离测试。只返回 pending=false 或 digest 不算成功。

### 7.3 验收

将真实接口输出交给固定 Octop 的原始 evaluate_handshake 校验；执行 code→consume→受控 IdP token endpoint 的 PKCE 兑换，断言返回原始测试 code。错误服务凭据、不同连接、过期、重复消费及重复 callback 均有确定结果。回调写入并发不能造成其他连接消费或两次成功。

## 8. FIX-06 / FIX-08：原生认证与授权边界

### 8.1 路由身份矩阵

| 接口                                        | 可接受身份                                               | 必须拒绝                                                         |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| handshake / oauth consume                   | 当前连接服务凭据                                         | 匿名、其他连接密钥、未经授权个人 token                           |
| tickets / interactions / operations / retry | 已验证、已预绑定的当前用户 Casdoor Access Token          | 连接服务密钥、其他主体、无资源权限用户；本期不扩展为任意 API Key |
| tickets redeem                              | 一次性 ticket + nonce；检查当前身份/连接/授权状态        | 重放、过期、nonce 不符、撤销及跨连接票据                         |
| save / submit / 页面详情                    | 原生 Browser Session + 当前 embed context + 当前业务授权 | 只有 Session 没有上下文、detail 越权写入、失效绑定               |
| 集成/身份/表单管理 API                      | 原生管理身份 + 具体 settings action 授权                 | 仅登录的普通用户、未经许可的 scoped key                          |

### 8.2 用户 token 路由准入

为受保护协议路由声明真实的 `casdoorAccessToken` security 并使用原生 `auth.required`；必要的凭证策略仅限这些路径/动作，不对全站开放。保持接口文档与运行准入一致。

挂载 `/api`、设置 Hono auth 变量、调用 authorization.middleware 或解析 JWT，均不替代真正认证和资源判断。服务函数调用也必须带受验证的权限上下文，不能把公开请求的 userId 直接传给 Repository。

### 8.3 管理权限

新增或复用具名 settings 资源，为连接 read/configure/rotate、表单 read/configure、交互/审计 read 定义明确动作。使用原生授权服务，不自行维护一套 admin 字符串判断。

普通用户即使已激活，也不能新增/修改连接密钥、注册 handler、修改主体绑定或浏览审计。管理 API 先检查权限再读配置和校验可披露输入，避免越权探测已有对象。

### 8.4 业务授权

将 form.permissionRef 与原生已注册资源和动作绑定。出票、打开、保存、提交、详情、拉回执、操作查询和重试均重新授权；本地身份和 active binding 不天然授予任何单据动作。

同一用户至少配置：允许的一类通用测试单据、无创建权限的另一作用域、合法已有记录的后续动作拒绝。不能以 title=reject-me 替代权限测试。对已安全识别的操作可以产生可披露业务拒绝回执；未知/无权访问他人资源使用 403 或防枚举结果，不能为展示卡片泄露记录内容。

### 8.5 验收

真实 HTTP 测试覆盖 401、403、成功和当前授权撤销；管理接口越权、跨记录读写、越权字段、普通用户 token 与服务密钥混用均拒绝。必须证明用户无 native Permission Set 时，只有票据或 embed context 也不能提交。

## 9. FIX-07 / FIX-15：票据、主体与嵌入生命周期

### 9.1 标准输入与命名空间主体

出票解析现有插件真正发送的嵌套 subject，不把平铺别名当作唯一输入。

```json
{
  "protocol": "business-ui.v1",
  "subject": {
    "issuer": "https://octop.company.com",
    "sub": "https://octop.company.com|42"
  },
  "form_ref": "generic.request.edit",
  "record_id": null,
  "schema_version": "1",
  "record_version": 0,
  "action": "edit",
  "interaction_id": "int-example",
  "nonce": "random-example",
  "connection_id": "site-a"
}
```

subject.issuer 必须与路由所属 connection 的批准 issuer 一致，sub 必须与已验证本地用户的受控预绑定一致；缺失、冲突或不匹配直接拒绝。不从“该用户的第一条 binding”推断请求主体，不自动建立绑定。

### 9.2 票据与上下文约束

票据持久化摘要、连接、主体绑定及版本、本地用户、interaction、form/schema/record/version、action、nonce、受众和 TTL；建议 TTL 60 秒。消费以原子更新完成，防止多副本重复兑票。

兑票解析 `application/x-www-form-urlencoded`。错误 Content-Type 或字段应返回明确 400/415，不把 JSON 解析失败静默降级为空成功输入。nonce 必须与出票记录精确匹配。

经原生 `Auth.signInUser` 等受支持流程建立 Session；embed context 只收窄动作，不构成第二套身份。若浏览器已有另一用户 Session，不得静默覆盖。无法取得真实 Session 引用时失败关闭，不能随机造 sessionRef 继续。

每次兑票和操作重新验证连接、Provider、账号、绑定版本、表单启用状态和原生权限。撤销后重新启用绑定也不能复活旧票据/上下文，应使用绑定 revision/授权版本失效检查。

### 9.3 唯一性与并发

冻结本期规则：同一连接同一 Octop subject 至多一个有效本地绑定；同一连接同一本地用户至多一个有效 Octop subject。历史绑定保留审计，不自动合并。

使用数据库约束和事务保证，不只做 preview。建议增加“当前绑定占位表”，以 connectionId+localUserId 唯一引用有效 binding，同时保留原 subject 唯一约束；或使用在 SQLite/PostgreSQL 均验证的等价方案。并发创建/撤销/重绑必须与占位记录原子一致。

迁移前发现历史冲突时输出脱敏报告并阻断，不自动删除、挑选任意赢家或改变历史单据归属。本期不开放静默将已使用的外部主体转交另一员工的功能。

### 9.4 浏览器要求

兑票响应的 CSP frame-ancestors 限定批准 Octop Origin；Cookie 使用原生安全配置，按 App 隔离。跨站场景验证 Secure/HttpOnly/SameSite，写接口保留 Origin/CSRF 防护。自定义协议路由不在原生保护范围时须显式补齐。

同站 HTTPS 是部署优先方案，不等于已解决全部浏览器限制。现场不支持 iframe 存储时应明确阻断嵌入验收，不通过共享 Cookie、关闭安全属性或修改 Octop 来掩盖。

## 10. FIX-09：权威回执与操作查询

### 10.1 对外响应必须扁平

`POST /interactions/{id}` 和 `/operations/{id}` 均返回插件可直接读取的回执结构，不把权威结果仅包在 receipt/data 内，不要求插件识别 latestSubmitOperationId 等自定义别名。

```json
{
  "success": true,
  "status": "submitted",
  "approval_status": "not_required",
  "subject_sub": "https://octop.company.com|42",
  "interaction_id": "int-example",
  "operation_id": "op-example",
  "document_type": "generic.request",
  "record_id": "REQ-EXAMPLE-0001",
  "form_ref": "generic.request.edit",
  "schema_version": "1",
  "record_version": 2,
  "receipt_sequence": 3,
  "documentType": "generic.request",
  "recordId": "REQ-EXAMPLE-0001",
  "formRef": "generic.request.edit",
  "schemaVersion": "1",
  "recordVersion": 2,
  "interactionId": "int-example",
  "allowed_actions": ["view_document", "close"],
  "allowedActions": ["view_document", "close"],
  "result": {
    "type": "SUCCESS",
    "status": "SUCCESS",
    "code": "SUBMITTED",
    "message": "Generic test document submitted",
    "disclosable": true,
    "safe_retry": false,
    "idempotent": true,
    "side_effect": true
  },
  "navigation": { "form_ref": "generic.request.detail" },
  "summary": { "title": "Generic integration test", "quantity": 1 }
}
```

七字段与 snake_case 别名由同一个 DTO 生成；`record_id` 和 `record_version` 必须存在。正式记录未创建时 recordId/record_id 为 null，不使用 UNKNOWN、REJECTED 或 draftId 冒充正式记录 ID。

### 10.2 状态约束

| 情况             | 对外结果                        | 行为                                                 |
| ---------------- | ------------------------------- | ---------------------------------------------------- |
| 草稿保存         | status=draft；无提交成功结果    | 保持编辑态；不生成正式编号，不诱导插件切换 submitted |
| 正式提交成功     | SUCCESS / SUCCESS               | 可查看真实只读详情                                   |
| 已识别操作被拒绝 | BUSINESS_REJECTED               | 只提供可披露信息；无权新建不产生正式记录             |
| 已有记录后续拒绝 | BUSINESS_REJECTED + 原 recordId | 保留原记录，不伪造新记录                             |
| 确认失败         | TECHNICAL_ERROR / FAILED        | 符合安全条件才返回 retry                             |
| 结果未知         | TECHNICAL_ERROR / UNKNOWN       | 只查询原操作，不能自动重提                           |

当前插件会将 SUCCESS 结果归入提交成功状态，故**保存草稿不得复用提交 SUCCESS 回执**。保存可返回 draft 字段和版本；其权威状态可被同一 interaction 读回，但不声称已正式提交。 草稿交互拉取仍应满足插件的顶层接收条件：返回 `success: true`、`status: draft`、当前 `operation_id`/交互字段、`record_id: null`、版本与 sequence，不返回提交 SUCCESS 的 result；这里的 success 只表示读取请求成功。以原始插件解析测试证明草稿仍保留编辑状态。

结果类型及副作用表达必须可区分：UNKNOWN 的 `side_effect` 可为 null（尚不确定），不能因为 DTO 只允许 boolean 而虚构已发生/未发生副作用；FAILED 安全重试必须能证明无已完成副作用或可靠幂等。

### 10.3 回执持久化与顺序

成功、拒绝、确认失败、UNKNOWN 及其恢复均应有持久化状态与可恢复 latest 指针。拒绝且业务回滚时，操作结果通过独立结果事务记录；不强求与不存在的业务记录一同写入，但必须可重试恢复。

sequence 与 recordVersion 分别反映回执与业务版本；只读查询不生成新业务副作用。相同结果重复获取可以返回相同 sequence，状态变化才按事务递增；旧回执不能覆盖新状态。

详情打开失败是导航错误，不将已提交单据改成业务失败。权限收回后新响应不再返回未授权摘要/详情；不能承诺擦除用户已看到或 Octop 已缓存的历史内容。

## 11. FIX-10 / FIX-12：操作、事务、幂等与恢复

### 11.1 服务端提交身份

首次允许打开交互时，持久化稳定的提交 operationId 或可在副作用前原子确定的提交槽位。该 ID 与 interaction/主体/连接关联，不因保存、重开或重复出票变成其他操作。

浏览器提交键由服务端上下文签发或确定，绑定动作和请求摘要；不能遗漏就随机生成幂等键继续执行。相同键相同有效载荷返回原结果；相同键不同有效载荷返回 409。

保存内部审计 ID 与正式提交 operationId 分开；保存不能覆盖客户端用于未知提交查询的关联。不同 payload 的重新提交只在前次明确未执行/确认失败且服务器允许开启新尝试时进行。

### 11.2 首次 operationId 发现

当前插件不保证读取 ticket 响应里的 operationId。不能靠向出票响应增加该字段解决 UNKNOWN 恢复。

`POST /interactions/{id}` 必须用插件已知的 interactionId 返回当前稳定 operation_id，即使尚无最终结果。若首次提交响应和首次回执都丢失，恢复网络后通过既有 interactions.get，或重开历史触发 lookup/get 恢复关联，再执行 query_status。断网期间只能显示未知，不能靠再次 submit 找状态。

### 11.3 事务与并发

业务记录/正式编号、成功 operation、成功 receipt 和 latest 指针同库事务提交。拒绝、FAILED、UNKNOWN 结果有明确持久化与恢复边界。提交键、记录版本及交互归属通过数据库约束/行锁/条件更新处理并发。

如果提交校验或事务失败，不能留下永远无法解释的 UNKNOWN。恢复器核对已提交事务、提交键和 attempt 事实；能够确认未执行则置 FAILED，仍无法确认则保持 UNKNOWN。对账不能把“任意存在的 receipt”一律认定为 SUCCESS，必须检查其结果类型。

### 11.4 安全重试

本期必须提供至少一种经过证明的 FAILED 无副作用场景，而非永远返回 RETRY_NOT_SAFE。

允许条件：FAILED，当前仍有权限，safe_retry=true，且无已完成副作用或有可靠幂等保证。UNKNOWN、SUCCEEDED、已确认有副作用或权限已撤销时拒绝。重试保留原 operation 的因果关系并记录 attempt，不生成第二份正式单据；不能删除幂等记录后重试。

### 11.5 故障夹具

测试配置/代理只在隔离环境可用；至少支持写入前确认失败、数据库提交成功后响应丢失、回执拉取响应丢失，以及查询先 UNKNOWN 再明确结果。生产关闭故障管理入口，禁止由普通表单字段触发故障。

不得把“在写入前直接返回 UNKNOWN”当作“已提交但丢响应”的证据。测试命名和断言必须对应真实时序。

## 12. FIX-11：通用编辑、只读详情与刷新提示

### 12.1 编辑页

仅含标题、说明、数量及只读状态/版本；owner、正式编号和系统字段由服务器维护。保存不提交，重复点击共享提交保护；409 提示重新加载核对，不自动覆盖。

### 12.2 详情页

`generic.request.detail` 根据已授权 recordId 读取真实持久化记录，展示服务器已提交的数据。无 Save/Submit 按钮，不建立可写 actionBounds；即便构造直接写请求也必须被服务端拒绝。

不能仅去掉按钮却保留服务端写权限；不能返回同一空白编辑表单作为详情。不存在或无权查看记录不得展示原摘要。

### 12.3 postMessage

在提交开始、完成和异常时发送最小刷新提示，带 interaction、nonce 并使用批准的 targetOrigin。不得包含 token、ticket、Secret 或把前端消息作为可信成功证明。插件现有轮询/回执拉取仍是结果来源，消息丢失不影响业务事务。

表单 URL/请求根据真实 App base path 构造，不能硬编码根路径导致受 App Host 挂载后失效。存在多连接 publicBaseUrl 时必须按路由/连接解析，不能让所有票据落到同一默认连接。

## 13. FIX-13 / FIX-14：IAM 撤销、Token 和权限所有权

### 13.1 Provider 与账号状态

启用企业集成的 App 必须配置明确受信 Provider。Provider 停用、已删除、准入不通过均拒绝新 token 请求及新会话；不能因 findEnabledByIssuer 返回 undefined 进入旧绑定兼容放行。

账号禁用使用原生 UserAdministrationService，撤销 Session 与实时连接；身份适配器同步失效票据/上下文/凭证缓存。Provider/连接/绑定停用也要在每次访问检查；仅靠浏览器隐藏登录按钮不够。

### 13.2 资源 Access Token 合同

启动或启用时校验 issuer、JWKS/验证方式、非空预期 audience、有效期和作用域策略。资源接口不接受任意同 Issuer 的签名 JWT。要求 token 有有限 exp，验证 nbf/适用 iat 和签名；ID Token 不代替 Access Token。

资源 token 的 purpose、client/resource/audience/scope 校验按真实 Casdoor 的可验证能力冻结，不臆造一个固定 typ。若现场无法可靠区别资源 token 与仅用于登录的 JWT，须调整授权服务器资源配置或采用其受支持的 token 验证接口；未解决前阻断 Gate B。

### 13.3 防止旧 token 重授权限

推荐本期修复策略：目录同步保存当前身份属性快照、观测时间与授权版本；已有权威目录快照时，权限映射只按该快照计算，JWT 只证明身份，不用旧 groups 覆盖更新的目录事实。

首次 JIT 可在明确准入策略下使用已验证 token 完成初始化；首次目录对账之后进入目录权威模式。不因收到“更新的 JWT”便跳过该模式。目录快照失效时暂停新授权升级，并按配置的新会话/写操作策略失败关闭；保留可解释错误和管理员对账入口。

建议同步周期 5 分钟、快照可接受期限 10 分钟；作为默认配置交付，不宣称已达到现场指标。测试必须包含“目录删组→同步撤权→继续使用仍有效旧 JWT→权限仍被拒绝”。

### 13.4 人工授权所有权

managedPermissionAssignments 必须按真正 assignmentId 证明所有权。IAM 创建 A 后，管理员删除 A 并人工创建 B，下一次 reconcile 不能将 B 当成 A 的延续认领。

同 set 的 stale managed row 不能证明 B 归适配器所有。处理旧 row 时先核对当前真实 assignmentId；清理自有过期跟踪，不撤销 B。多个映射规则共享同一 IAM 所有授权时，最后一个规则撤回才回收该授权；始终保留来源审计。

## 14. FIX-16：控制面与管理入口补齐

### 14.1 原生管理入口

注册模板已有的 Users/Permission Set 管理页面，按原生 settings 导航呈现。创建或分配 publisher/platform-admin 必须在授权界面可见，不用启动时给所有 authenticated 用户授予业务权限。

ReleasesAccess 的 page 标记与原生 page:rel-apps/access 需要明确同时配置；验证非 root 发布人员可进入页面且只能操作被授权 App，不能只测权限映射纯函数。

### 14.2 身份与集成管理

本期最终交付提供受权限保护的配置页面：IdP/准入、同步状态/运行、映射、主体导入预览与提交、连接/密钥轮换、表单注册与列表、操作和审计查询。优先复用现有 API 和页面组件，不建设新设计器。

Gate A 可用经过授权的 API 完成联调初始化，不要求为开始技术联调先做完全部管理 UI；但 Gate B 的产品交付不能把原 PRD 要求的管理页永久降格为“后续”。关键启停、撤销与凭据配置必须有可审计操作方式。

GET forms 等列表必须返回真实已注册数据与分页，不能固定返回空数组。只返回已授权元数据，不回显 serviceSecret、code、token 或内部 handler 源码。

### 14.3 部署与证据文档

修订 P0–P4 文档，清除已失效的“用户先恢复 origin push”阻断说明；保留真实环境依赖。每一条“已覆盖”对应可运行测试、执行提交、命令、环境与断言。不能继续把受控 JWKS 探测写成真实用户登录通过。

## 15. 数据迁移、兼容与回退

### 15.1 不修改已合并迁移

已有 identity/Adapter 迁移已经进入 develop/v3.0.1，不能原地修改其列、索引、名字或校验和。全部修复使用新增、排序在既有迁移之后的自包含迁移。

### 15.2 必须评估的结构变更

| 对象                | 修复方向                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| OAuth 暂存          | 可解密密文及 key 版本；旧摘要暂存全部失效                                    |
| Tickets             | nonce、action/受众、绑定 revision、schema/协议修订标记；旧无完整约束票据失效 |
| Embed contexts      | 绑定 revision、受限动作、必要的记录/连接约束；旧上下文撤销并重新打开         |
| Subject bindings    | 当前有效绑定唯一性/占位表与版本；保留历史归属                                |
| Operations          | 稳定提交关联、提交键摘要、attempt/失败与恢复事实                             |
| Receipts            | 所有结果类别的可空正式 ID、sequence 和 latest 关系                           |
| External identities | 目录权威快照、观测时间、授权版本或等价撤销机制                               |
| Permission tracking | 校验 assignmentId 所有权，不认领人工替代授权                                 |

新增字段的实际名称和存储实现由开发按仓库类型/数据库规范确定，不得把本表视为已存在数据库 API。

### 15.3 迁移与存量保护

- 分别测试空库安装、原缺陷版本升级、up/down/up，以及已有正式单据的保留。
- 发现重复 binding/无法解析历史回执时输出报告，不能删除正式记录或任意改 owner。
- 旧 code/ticket/embed 失效允许要求用户重新授权/打开；不删除历史成功 operation/receipt。
- 配置和加密密钥一并备份；密钥轮换验证可解密仍在 TTL 内的受支持 code。
- 迁移若产生不可逆的新授权事实，不将 down 描述为自动恢复旧登录资格；代码回退、数据库恢复与业务数据处理分别记录。
- 已知不安全版本不作为自动降级目标；修复发布失败时优先保留可恢复数据并关闭集成入口。

## 16. 回归测试与证据矩阵

### 16.1 测试层次

| 层级             | 要验证的事实                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| 单元             | DTO、规则、映射、错误码与边界                                                |
| 数据库           | 唯一性、事务、并发、迁移升级及恢复；SQLite 和目标 PostgreSQL                 |
| Application HTTP | 真正组装模板、加载插件、运行 auth/authz/middleware、原始 Content-Type 和路径 |
| 消费者契约       | 固定 Octop 原始握手/回执解析及按钮约束，不复制一份简化解析器当作契约         |
| 现场 E2E         | 真实 Casdoor、现有 Octop、HTTPS iframe、目标浏览器和同一测试用户             |

Gate A 的 OIDC/JWKS 可以使用隔离受控服务；用户 identity、Authorization 和数据库不能全部用伪造对象替代。此前探针只用于证明缺陷，不可直接变成 Gate A 全部证据。

### 16.2 必跑用例

| 测试 ID | 场景                       | 必须断言                                                       | Gate                 |
| ------- | -------------------------- | -------------------------------------------------------------- | -------------------- |
| R01     | 干净冻结安装               | 无 importer/peer 缺失，lockfile 不被改写                       | A                    |
| R02     | 四个目标包检查             | scoped lint/typecheck/test/build 成功                          | A                    |
| R03     | 真应用启动                 | Demo 路由/迁移/Provider 实际加载；Control 身份与 Releases 生效 | A                    |
| R04     | 首次/重复/并发登录         | 唯一本地用户与绑定，两条身份路径一致                           | A/B                  |
| R05     | 同邮箱不同 Subject、未准入 | 无隐式合并，无有效会话                                         | A/B                  |
| R06     | 原始插件握手               | evaluate_handshake 通过，缺能力负例失败                        | A                    |
| R07     | OAuth code→consume→token   | 返回原始 code，PKCE 兑换；错误 verifier 拒绝                   | A/B                  |
| R08     | OAuth 并发/连接隔离        | 最多一次消费，另一连接不得消费                                 | A                    |
| R09     | 外部 token 路由准入        | 合法 token 成功，未声明路由仍拒绝，不全站放行                  | A                    |
| R10     | 错 audience/过期/ID token  | 资源访问拒绝；缺必要配置失败关闭                               | A/B                  |
| R11     | 管理 API 非管理员访问      | 匿名 401、登录无权限 403、有权限成功                           | A                    |
| R12     | 嵌套主体错配               | issuer/sub 任一不符拒绝，不推断第一 binding                    | A                    |
| R13     | form-urlencoded 兑票       | 原始 HTTP 请求成功，错误格式受控拒绝                           | A                    |
| R14     | nonce/过期/重放            | 拒绝，不能产生有效 embed                                       | A                    |
| R15     | 出票后撤销绑定             | 兑票拒绝；重新启用也不复活旧票                                 | A                    |
| R16     | embed 后停用连接/撤销权限  | 保存/提交/详情/查询按当前策略拒绝                              | A                    |
| R17     | 页面与 API 授权            | 同一用户不同类型/动作有真实允许与拒绝                          | A/B                  |
| R18     | 草稿保存                   | status=draft，recordId=null，非 submitted，无正式详情按钮      | A/B                  |
| R19     | 正式提交与扁平回执         | 同库真实数据、原始插件能解析并更新原卡片                       | A/B                  |
| R20     | 只读详情                   | 真实数据可见；无写按钮；伪造写请求仍拒绝                       | A/B                  |
| R21     | 拒绝新建/拒绝后续动作      | 前者无正式编号；后者保留原记录；历史结果可恢复                 | A/B                  |
| R22     | FAILED 安全重试            | 无副作用确认，允许重试后最多一次正式结果                       | A/B                  |
| R23     | UNKNOWN 重试               | 拒绝，query-only 不写业务数据                                  | A/B                  |
| R24     | 已提交但响应丢失           | 查询原操作恢复 SUCCESS，没有第二次记录                         | A/B                  |
| R25     | 首次回执也丢失             | 现有 get/历史 lookup 恢复 operationId，不再次 submit           | A/B                  |
| R26     | UNKNOWN 后确认失败         | 可恢复为 FAILED；不能盲目当成功                                | A/B                  |
| R27     | 并发提交/请求摘要冲突      | 副作用最多一次；同键不同摘要 409                               | A                    |
| R28     | record_version 冲突        | 409，无覆盖                                                    | A                    |
| R29     | 旧回执/重复回执            | 不倒退，版本与别名一致                                         | A                    |
| R30     | Provider 停用              | 已绑定用户仍拒绝，不进入兼容放行                               | A                    |
| R31     | 目录删组后使用旧 JWT       | 权限不被重新授予                                               | A                    |
| R32     | 人工替代 assignment        | 不被认领、不被后续规则删除误撤销                               | A                    |
| R33     | 多规则共享/撤销            | 只回收自身管理的授权                                           | A                    |
| R34     | 并发主体导入               | 同连接用户/主体唯一性由数据库保证                              | A；目标 PG 于 B 复测 |
| R35     | 非 root 发布人员           | 原生页面可进入，API 只允许关联 App                             | A/B                  |
| R36     | App base path / 多连接     | 回调、兑票、表单请求路由均正确                                 | A/B                  |
| R37     | HTTPS iframe               | 目标浏览器 Cookie、CSP/Origin 真正工作                         | B                    |
| R38     | 历史恢复/失权              | 新响应不泄露未授权摘要，已知结果不被误改                       | A/B                  |
| R39     | 新库/升级/迁移回退         | 数据及归属保留，不编辑旧迁移                                   | A；目标 PG 于 B      |
| R40     | Host 生命周期与兼容回退    | in-process / Docker 均使用通用模板验证                         | B                    |
| R41     | 备份恢复/密钥轮换          | 恢复身份、记录、operation/receipt 关系                         | B                    |
| R42     | 生产故障开关/日志          | 测试入口关闭，凭据不披露                                       | A/B                  |

A/B 表示 A 在受控环境执行协议/数据库验证，B 在真实现场复测交互链，不是允许任选其一。

### 16.3 建议检查命令

以下为基于当前包脚本的检查入口；实际命令必须由实施者在目标提交运行并保存输出，本文件未执行修复后的测试。

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

遵循实际依赖构建顺序。数据库集成套件顺序执行，不并发占用同一测试实例；测试命令应进一步限定相关新增/受影响套件，不能靠 passWithNoTests、skip、删除负向用例或降低断言获取通过。

原生页面权限、OpenAPI 和依赖变更涉及的守护检查也必须运行，按仓库规则选择受影响范围；不能仅因插件自身 tests 通过就忽略模板消费者。不要把未跑的全仓检查列为已通过。

## 17. 交付顺序、分工与 PR 拆分

| 修复批次      | 内容                                    | 依赖                | 出口                                                |
| ------------- | --------------------------------------- | ------------------- | --------------------------------------------------- |
| R0 构建与装配 | FIX-01、FIX-02；模板配置/迁移/依赖      | 固定基线            | 干净可启动 Application，基础路由真实存在            |
| R1 身份与撤销 | FIX-03、FIX-06 身份部分、FIX-13/14/15   | R0                  | 两身份路径统一，准入、旧 token 撤权与绑定唯一性通过 |
| R2 协议与票据 | FIX-04/05/07/09，管理授权部分           | R0；安全身份依赖 R1 | 原始消费者握手、OAuth、兑票和回执可读               |
| R3 业务与恢复 | FIX-08/10/11/12                         | R1/R2               | 真授权、只读、幂等、FAILED/UNKNOWN 恢复通过         |
| R4 管理与部署 | FIX-16，迁移升级、文档和管理页          | 相关批次已稳定      | Gate A 准入报告；Gate B 现场计划与交付物齐备        |
| R5 现场验收   | 真实 IdP/Octop/浏览器、A–F、Host 和恢复 | Gate A + 环境输入   | Gate B 有证据通过或明确阻断                         |

建议 PR 按上表或更小的可独立审查单元拆分，均合回 develop/v3.0.1。R2 的协议纯函数可与 R1 部分并行，但凭证、主体绑定与事务 schema 先冻结；涉及同一迁移/服务的修改指定单一负责人。

角色建议：控制面负责人、身份负责人、Adapter 负责人、测试/部署负责人。每个问题指定 owner 和复核人；不在缺团队人数和环境时虚构固定人天。

## 18. 发布证据、DoD 与参考

### 18.1 交付物

1. 统一合并到开发分支的修复提交及 PR 清单，逐项关联 FIX 与 B/I 问题。
2. 同步的 lockfile、四个目标包源码、迁移及可复现制品。
3. 实际模板装配、Secret/IdP/连接配置 schema 和示例。
4. 原始消费者契约、Application HTTP、数据库并发及迁移回归测试。
5. Gate A 报告与 Gate B 现场报告，按 R01–R42 标记证据/未测/失败。
6. 更新后的部署、凭据轮换、绑定撤销、UNKNOWN 恢复、备份与回退手册。

### 18.2 证据模板

| 字段              | 内容                                                    |
| ----------------- | ------------------------------------------------------- |
| 测试 ID / 修复 ID | Rxx / FIX-xx / Bxx 或 Ixx                               |
| 基线/修复提交     | 完整 SHA，不只写分支名                                  |
| 环境              | Node/pnpm、OS、数据库、浏览器、Casdoor、Octop、插件 SHA |
| 输入与前置        | 同一用户、权限、连接、记录、故障时序；凭据脱敏          |
| 执行              | 命令/自动化步骤、实际时间与时区                         |
| 预期/实际         | 明确 HTTP、结果、数据库副作用计数及恢复结果             |
| 证据              | 日志/断言/截图或录像的受控引用                          |
| 结论              | PASS / FAIL / NOT RUN / BLOCKED；阻断分代码或环境       |

### 18.3 修复完成判定

- [ ] B01–B10、I01–I05 均有修复提交和对应回归证据，或明确说明已有独立提交关闭。
- [ ] 新插件实际装进正确模板，SSO 首登/重复/禁用两路径可用。
- [ ] 原始 Octop 消费者接受握手、code、form POST、扁平回执和操作查询。
- [ ] native auth/authz、subject/nonce/actionBounds 及所有撤销状态有效。
- [ ] 真实编辑、保存、正式提交、只读详情、拒绝、FAILED 和 UNKNOWN 恢复完整。
- [ ] 人工授权不被认领、目录撤权不被旧 token 逆转、并发绑定唯一。
- [ ] 未修改已合并迁移，升级保留历史身份与单据；一次性旧凭据安全失效。
- [ ] Gate A 已有实际执行证据，才标记“允许开始联调”。
- [ ] Gate B 的目标环境、管理页、双 Host、备份恢复证据完整，才标记“最终验收通过”。
- [ ] 不含 HR/CRM 实际 App，不依赖 Octop 核心改动或共享管理员单据 token。

### 18.4 固定源码参考

以下链接固定到本次提交，避免分支后续变化导致定位漂移。

- [评审提交](https://github.com/smc-copilot/nocobase/commit/6970c0766686fe2a92640b1d37711fc62a5ff5fd)

- [Control 服务端插件组装](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-smc-control/server/plugins.ts#L24)

- [Demo 服务端插件组装](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-integration-demo/server/plugins.ts#L23)

- [Control 认证配置](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-smc-control/server/config/auth.ts#L17)

- [Control 发布权限绑定](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-smc-control/server/providers/releases-access.ts#L40)

- [Control 页面注册](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-smc-control/client/routes.ts#L78)

- [Demo Docker 冻结安装](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/templates/app-template-integration-demo/Dockerfile#L48)

- [Business UI 握手输出](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L333)

- [OAuth 授权码存储与消费](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L362)

- [协议路由与浏览器兑票解析](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/routes/protocol.ts#L96)

- [回执和操作查询](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1106)

- [Adapter 管理 API](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/routes/admin.ts#L81)

- [票据绑定与嵌入上下文](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L237)

- [只读详情及 HTML 表单](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1315)

- [安全重试当前实现](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1174)

- [原生凭证路由准入](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-authentication/server/auth.ts#L890)

- [路由安全 Scheme 判定](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/app/app-server/src/router/openapi/declared.ts#L33)

- [Casdoor Token 校验](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-casdoor-identity/server/credential-resolver.ts#L91)

- [已有身份复用与准入](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-casdoor-identity/server/services/identity-provisioning.ts#L89)

- [权限分配所有权](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-casdoor-identity/server/services/permission-mapping.ts#L449)

- [P3 实际服务测试](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/packages/plugins/app-plugin-business-ui-adapter/tests/server/protocol-flow.test.ts#L24)

- [P3 验收材料与缺口](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/prd/acceptance/p3/README.md#L32)

- [P4 状态矩阵](https://github.com/smc-copilot/nocobase/blob/6970c0766686fe2a92640b1d37711fc62a5ff5fd/prd/acceptance/p4/README.md#L6)

- [Octop 握手校验](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/business_ui/outbound.py#L179)

- [Octop 需要原始 code](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/business_ui/activation.py#L388)

- [Octop 回执读取与合并](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/business_ui/service.py#L1216)

- [Octop iframe 表单 POST](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/ui/src/FormFrame.tsx#L30)

---

**修复目标：保留既有 NocoBase 平台架构，以真实应用装配、现有插件协议兼容、原生授权和可恢复事务闭环通过联调；不扩大到领域业务 App。**
