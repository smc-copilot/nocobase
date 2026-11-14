# NocoBase V2.0 独立授权代码完整性检查报告

> 日期：2026-11-14（北京时间）  
> 仓库：smc-copilot/nocobase  
> 目标分支：develop/v3.0.1  
> 固定检查提交：736f93227ffefe323ba26963be2687e8ad130e35  
> 对照需求：NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md  
> 检查性质：源码、构建、既有测试和隔离环境功能／安全边界复现；本报告不修改产品代码。

## 1. 结论

**代码完整性检查未通过，不能按当前证据认定 Gate A 通过，Gate B 也未完成。**

本轮架构方向已纠正：新增 NocoBase 自有 Agent Authorization 插件，支持本地用户、独立 client、授权码与 PKCE、opaque token、刷新和 grant 撤销；Adapter 已改为 agentAccessToken＋grant，核心依赖中不再要求 Casdoor，也不需要导入 Octop 主体绑定。

但存在四项已复现的核心阻断：

1. 同一用户的 Agent B 只读 token 能访问 Agent A 的连接、交互和操作，安全重试返回 SUCCESS。
2. 同一 grant 覆盖编辑权限时，仅包含只读 scope 的 token 仍能取得编辑票据。
3. client 停用后旧 embed 仍可保存；重新启用 client 后旧 access token 复活。
4. 未登录用户进入授权链后，登录回跳参数与原生守卫不一致，无法按当前链路回到授权流程；路径也未携带 App base path。

此外，异常卡片动作、Control 管理入口、审计覆盖、禁用用户刷新和验收证据仍不完整。上述判断使用 V2.0 独立授权基线，不再把可选 Casdoor 首登、目录同步或权限映射作为核心准入前置。

## 2. 检查范围与验证边界

### 2.1 主要范围

- packages/plugins/app-plugin-agent-authorization
- packages/plugins/app-plugin-business-ui-adapter
- packages/templates/app-template-integration-demo
- Control 对新模块的装配与页面覆盖情况
- 新迁移、依赖、客户端页面、协议路由及 Gate A v2.0 报告

### 2.2 已执行

| 检查                            | 实际结果                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 远程 HEAD 与本地提交一致        | 736f9322，使用 GitHub 接口和 Git 远程查询确认                                                                                                            |
| 冻结依赖安装                    | --frozen-lockfile --ignore-scripts 通过；98 个 workspace                                                                                                 |
| Agent Authorization 全包测试    | 8 个文件、11 个用例通过                                                                                                                                  |
| Business UI Adapter 全包测试    | 8 个文件、26 个用例通过                                                                                                                                  |
| Integration Demo 全部服务端测试 | 16 个文件、92 个用例通过                                                                                                                                 |
| 上述测试合计                    | 129 个用例通过                                                                                                                                           |
| 三个目标包 lint／typecheck      | 6 项分别执行，均通过                                                                                                                                     |
| 两个插件 build                  | 分别执行，均通过                                                                                                                                         |
| Demo 完整构建                   | 最终通过：先完成工作区依赖编译，再使用官方 NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD=1 复用依赖，完整执行客户端／服务端构建、生产依赖安装及校验，退出码 0 |
| OAuth HTTP 正向探针             | consent 200、授权码兑换 200、访问凭证解析成功、我的授权查询 200                                                                                          |
| 无效 client_secret              | token 端点返回 401                                                                                                                                       |
| 用户 grant 撤销                 | 相关 token 不再解析                                                                                                                                      |
| 边界探针                        | C01–C05、C08 的相关行为按本报告复现                                                                                                                      |
| GitHub CI                       | 当前连接返回的 commit statuses 为空，PR workflow runs 为空；不能当作 CI 已通过                                                                           |

本次运行环境为 Linux、Node 24.22.1、pnpm 11.25.0、SQLite；仓库声明 pnpm 11.7.0，报告保留此差异。

三个目标包的 lint、typecheck、build 共 9 项最终全部通过。Demo 第一次普通 build 在 300 秒检查时限处结束，最后处于 tooling typecheck，未报告编译错误；复跑时使用构建脚本正式支持的依赖复用开关，未跳过客户端／服务端类型检查、打包或生产依赖校验。构建输出确认 26 个服务端导入包可到达部署目录；不将首次超时记作代码编译失败，也不把跳过重复依赖编译隐去。

### 2.3 未作为已验证结论的范围

- 真实 Octop 浏览器激活与完整 UI 卡片旅程。
- HTTPS iframe 的现场 Cookie、CSP、Origin 和浏览器兼容矩阵。
- 目标 PostgreSQL、双 Host、备份恢复及现场密钥轮换。
- 管理页面的浏览器交互、完整前端回归和生产发布。
- 携带既有业务数据的完整升级／回退演练。

隔离探针使用真实 SQLite、原生 Auth、原生 Authorization、生产 OAuth／协议路由。client、grant 和 token 以受控夹具准备，未连接真实 Octop；登录回跳判断使用生产路由 Location 和从原生守卫提取的实际目标选择函数，不冒称已跑完整浏览器 E2E。

## 3. 功能完整性概览

| 功能                             | 当前状态           | 判断                                                                                             |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| NocoBase 本地身份与 Casdoor 解耦 | 核心方向已实现     | 新插件及 Adapter 夹具不需要 Casdoor 表；Demo 仍注册可选 Casdoor 插件，真实删插件应用启动需补专项 |
| client 注册、secret 校验及轮换   | 基础实现与测试通过 | 具备 API，Control 页面缺失，当前状态变更约束未贯穿全部访问                                       |
| consent、授权码和 PKCE           | 后端基础流程通过   | 首登回跳断点，页面信息不完整                                                                     |
| access／refresh／revoke          | 基础路径通过       | 禁用用户仍可刷新；client 恢复会复活旧 token                                                      |
| token／client／grant／scope 交集 | 未完成             | C01、C02、C03                                                                                    |
| Adapter 原生业务授权             | 已保留             | 原生权限校验存在，但不能替代外部 token 的委托边界                                                |
| ticket／embed                    | 基础流程通过       | 当前 client 与 token scope 检查不完整                                                            |
| 异常结果与恢复动作               | 部分完成           | 状态能读回，消费者缺查询／重试按钮                                                               |
| Control 接入应用、授权管理与审计 | 部分完成           | 新插件只有两个用户页，Control 无对应新模块装配                                                   |
| 迁移与交付证据                   | 部分完成           | 新迁移存在，历史数据演练与报告判定不足                                                           |

## 4. 已复现的核心缺陷

### C01 · P0：跨 client 查询与重试越权

**要求：** client B 的凭证不能使用 client A 的连接与操作，委托范围在每个受保护动作中都有效。

**复现：**

1. 同一个 NocoBase 用户分别授权 A、B。
2. 用户原生业务角色具有编辑权限；A 的 grant／token 有编辑范围，B 的 token 只有 business-ui:view。
3. 在 A 连接创建并兑票，注入写前 FAILED，得到 A 的 interactionId／operationId。
4. B 的真实 opaque token 请求 A 连接的 interactions、operations 和 retry。
5. interactions 和 operations 均返回 200；retry 返回 200 且 result.status=SUCCESS。

**根因：** 出票路由会读取 credential.data；交互查询、操作查询和 retry 路由只向服务传入 localUserId，丢失当前调用凭证的 clientId／grantId／scope。服务加载的是目标交互已保存的 A grant，不能代表当前 B 调用获得了授权。

**修复要求：** 所有 Agent 用户协议路由都携带并验证当前调用凭证，核对 client、连接、目标 grant、用户、audience 和有效 scope。对原生浏览器会话另行按受限 embed 处理，不把“同一 localUserId”当作外部系统身份相同。

**必须回归：** 同用户 A／B、同 client 不同 grant、跨连接、只读 token retry、不同用户；拒绝时业务记录和操作状态不改变。

来源：[protocol routes](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/routes/protocol.ts#L220)、[retry route](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/routes/protocol.ts#L262)。

### C02 · P0：token scope 被 grant 的更大范围覆盖

**要求：** 实际访问必须受当前 token scope 约束，不能因用户曾同意过更大 grant 而扩权。

**复现：** 同一 A grant 覆盖 view＋edit，签发一个 scope 仅为 business-ui:view 的真实 token。该 token 请求编辑表单 tickets，返回 200 并取得 ticket。

**根因：** issueTicket 使用当前 credential 找到 grant 后，loadActiveGrant 重新加载 grant 的完整 scopes；assertScope 检查 active grant，而不是 token scope 与当前 client／grant 的交集。

**修复要求：** 保留当前凭证的授权范围，执行 token、grant、client 当前允许范围及原生业务权限的交集；票据和 embed 也保存或可靠恢复签发时的受限范围，不能兑票后扩大。

**必须回归：** 同 grant 的窄 token、refresh 缩小 scope、后续扩大 consent、client 缩小允许范围、旧 embed 写入。只读 token 不得取得可写上下文。

来源：[loadActiveGrant](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L515)、[issueTicket scope check](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L884)。

### C03 · P0：client 停用未撤销既有 embed，旧 token 可复活

**复现：**

- 先完成 A 授权、出票、兑票。
- 通过 clients.update 停用 A；resolveAccessToken 正确拒绝 A 的 token。
- 用此前的真实 embed cookie 请求保存，仍返回 200／draft。
- 重新启用 A，原 access token 再次可解析。

**根因：** token resolver 检查 client.enabled，但 Adapter 的 requireGrant 仅检查 grant 状态、版本和过期；embed 后续访问绕过当前 client 状态。client 启停又没有推进可使旧凭证永久失效的安全版本或执行相应撤销。

**修复要求：** 统一检查 client、grant、本地账号、连接和有效范围；client 撤销／停用策略贯穿 token、refresh、ticket、embed 和操作查询。重新启用后要求新的有效授权／凭证，不复活已经按撤销策略失效的旧凭证。

**必须回归：** 停用前出票、兑票、保存、提交、查询、重试；重新启用；A 受影响但 B 和本地登录不受影响。

来源：[Adapter grant source](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/providers/business-ui-adapter.ts)、[grant requireActive](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/server/services/grants.ts#L169)、[token client check](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/server/services/oauth.ts#L312)。

### C04 · P0：首次登录不能按当前链路返回授权，App 路径丢失

**复现：** 匿名请求 authorize，返回 /login?callbackURL=...。原生 AuthenticationGuard 的 signedInDestination 只读取 redirect，因此该 Location 经原生目标选择后得到 /，而不是授权页面。

**代码问题：** authorizePath、login 和 consent 路径也都从根路径拼接，未带实际 App base path；这会影响受管理 App 的挂载。

**修复要求：** 对接原生登录契约，保留授权请求上下文和安全回跳；统一使用 App 路径解析。若返回目标为服务端 authorize API，要处理全页面导航与 SPA 导航的区别，不能只改一个参数名就宣告完成。

**必须回归：** 未登录开始、登录、同意、callback／consume、兑换 token；已经登录；拒绝；重放；/main 与另一非根挂载路径。使用真实应用和浏览器链路验证。

来源：[OAuth login redirect](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/server/routes/oauth.ts#L138)、[native redirect contract](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-authentication/client/auth-provider.tsx#L170)。

## 5. 其余完整性缺口

### C05 · P1，Gate A 必须关闭：UNKNOWN／FAILED 缺动作

本轮独立授权链路再次复现：UNKNOWN 的交互和操作查询仅返回 close；safe_retry=true 的 FAILED 交互也仅返回 close。使用固定 Octop 原始 receipt.buttons_for 消费实际响应，UNKNOWN 和 FAILED 都没有对应 query_status／retry；FAILED 操作查询甚至无动作列表。

修复应统一提交、interaction、operation 的权威 DTO 和 allowed_actions，包含真实权限判断及单调 sequence。新增测试必须消费实际服务结果，而不是手工构造一份理想回执。

来源：[allowed actions](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1956)。

### C06 · P1：管理页面、授权展示和审计未完整交付

新插件只有 consent 和 my-grants 两个用户页面；Control 尚未注册 Agent Authorization 模块，也未交付接入应用管理、范围／密钥轮换管理及授权审计页面。后端 client 管理 API 存在，不能视为控制面页面完成。

consent 当前显示 client_id、原始 scope 和 Redirect；未完整展示经服务器读取的应用名称、目标 App 和授权期限信息。应使用经验证的服务器元数据呈现授权对象。

审计写入调用仅见 OAuth consent 的 approve／deny；client 注册、启停、轮换和 grant 撤销未完整接入该模块的审计记录。grants.revoke 的 actor 参数尚未用于审计。

来源：[client routes](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/client/routes.ts)、[consent page](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/client/pages/consent.tsx)、[Control composition](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/templates/app-template-smc-control/server/plugins.ts)。

### C07 · P1，Gate A 必须关闭：验收报告超出实际证据

仓库报告宣称 A01–A24 核心 PASS，但 A15、A17 自列 PARTIAL；按照 V2.0，这些 A 项不能直接转成整体通过。

A19 被标记 PASS，但 C05 已证明消费者动作缺失。A10 的跨 client 约束仅在出票等路径存在，C01 证明查询／重试不满足。所谓 Octop token contract 测试主要检查文件包含字符串和调用内部服务，未执行完整授权码 HTTP 兑换及真实消费者激活链。

命令写成一次 lint typecheck test build 不能证明四个脚本分别执行；需分别记录命令、提交、环境、退出码和断言。本次审计已经拆开执行相关检查。

需重评受影响条目，补真实首登、窄 token、跨 client、client 停用、禁用用户刷新、历史数据迁移和双 App 回归，再决定 Gate A。

来源：[Gate A v2 report](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/prd/acceptance/gate-a-v2-report.md)。

### C08 · P1，Gate A 必须关闭：禁用用户仍可刷新签发 token

通过原生 users.disable 禁用本地用户后，向生产 token 路由提交合法 refresh_token 与 Basic client 凭据，仍返回 200 并签发新 token。新 token 在资源解析阶段正确被拒绝，因此不能据此称其已可越权访问业务；但签发端的账号有效性约束没有完成。

授权码兑换和刷新在签发前应检查当前用户、client、grant 及范围，不能只等后续请求失败。补禁用后兑换／刷新、重新启用、撤销竞争和过期测试。

来源：[refresh issuance](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization/server/services/oauth.ts#L250)。

## 6. V2.0 A01–A24 重新评定

这里 PASS 仅对应列明的检查范围；PARTIAL 不能算作完整 Gate A 放行。此矩阵不以源码文件存在替代运行证据。

| ID  | 本次评定           | 依据／剩余项                                                                                |
| --- | ------------------ | ------------------------------------------------------------------------------------------- |
| A01 | PARTIAL            | 核心服务与 Adapter 无 Casdoor 表可运行；Demo 仍注册可选 Casdoor，移除插件后的真应用专项需补 |
| A02 | PASS（基础）       | 两 client 注册、独立凭据及轮换测试通过                                                      |
| A03 | FAIL               | C04，未登录授权不能按现有回跳契约继续                                                       |
| A04 | PARTIAL            | deny 分支存在；未完成新用户／拒绝浏览器旅程                                                 |
| A05 | PASS（凭据校验）   | 错 secret 的真实 token HTTP 返回 401，client authenticate 停用拒绝；后续访问问题归 A14      |
| A06 | PARTIAL            | PKCE 错误和 code 重放已有测试；完整 expiry／redirect／并发矩阵未齐                          |
| A07 | PARTIAL            | 正常 token／refresh 基础路径通过，签发有效性与失效矩阵有缺口                                |
| A08 | PASS（协议边界）   | agent token 不能替代 session 直接保存／提交，服务凭据不能替代用户 grant                     |
| A09 | PASS（基础 grant） | 同用户两 grant、撤销 A 保留 B 的服务测试通过                                                |
| A10 | FAIL               | C01，B token 查询并重试 A 操作返回成功                                                      |
| A11 | PARTIAL            | 本地身份由认证上下文与 grant 选择；完整 body 篡改专项需补                                   |
| A12 | PASS（已测范围）   | Demo 原生 Permission Set 撤销及记录范围回归通过                                             |
| A13 | PASS（基础撤销）   | grant 撤销使 token 失效；完整 cookie／并发矩阵需随修复补齐                                  |
| A14 | FAIL               | C03，client 停用后旧 embed 仍可保存                                                         |
| A15 | FAIL               | C08，禁用用户仍能刷新，资源阶段才拒绝                                                       |
| A16 | FAIL               | C03，重新启用 client 后旧 access token 可复活                                               |
| A17 | PARTIAL            | 服务已按 DI 分 App；双 App 实际隔离与路径未完整验证                                         |
| A18 | PASS               | 不需要 Octop 主体预绑定即可出票／兑票并进入业务链                                           |
| A19 | FAIL               | C05，真实消费者无 query_status／retry 动作                                                  |
| A20 | PARTIAL            | Adapter 幂等与模拟恢复测试通过，实际响应丢失／并发矩阵需补                                  |
| A21 | PARTIAL            | Secret 不回显及 API 权限结构存在，管理 UI／完整 HTTP 越权矩阵未齐                           |
| A22 | PARTIAL            | 新迁移及空库测试通过；存量用户／正式记录升级与回退演练未完成                                |
| A23 | PARTIAL            | client_secret_post 正向 HTTP 验证通过；固定 Octop 完整激活链未跑                            |
| A24 | PARTIAL            | 我的授权查询与基础 grant 撤销有效；浏览器撤销、Octop 本地断开和远端撤销需分别验证           |

不再纳入强制 Casdoor 首登／目录同步／映射要求。可选 Casdoor 的已知缺陷保持独立清单，不能用它们代替本报告的独立授权问题。

## 7. 实测摘要

以下为受控探针结果摘要，不包含可用凭据：

```json
{
  "read_only_token_issue_edit_ticket": {
    "scope": "business-ui:view",
    "http": 200,
    "ticket_issued": true
  },
  "client_b_access_client_a": {
    "interaction_http": 200,
    "operation_http": 200,
    "retry_http": 200,
    "retry_result": "SUCCESS"
  },
  "disabled_client_existing_embed": {
    "access_token_rejected": true,
    "save_http": 200,
    "status": "draft"
  },
  "old_access_token_revived_after_reenable": true,
  "anonymous_authorize": {
    "login_query_parameter": "callbackURL",
    "native_guard_parameter": "redirect",
    "after_login_destination": "/"
  },
  "disabled_user_refresh": {
    "http": 200,
    "issued_token": true,
    "resource_token_resolves": false
  },
  "unknown_consumer_buttons": ["close"],
  "failed_consumer_buttons": ["close"]
}
```

测试使用的业务用户持有原生编辑权限；只读限制施加在外部 Agent 的委托 token 上。C01／C02 验证的是委托边界，不能因本地用户本人有编辑权限而判为允许。

## 8. 后续关闭顺序

1. **凭证上下文与最小授权：** 修 C01／C02；让 client、grant、token scope 和目标资源约束贯穿全部用户协议路由。
2. **统一生命周期：** 修 C03／C08；使 client／用户／grant 的当前状态、版本和撤销规则贯穿签发及既有 embed。
3. **首登与页面闭环：** 修 C04，验证真实登录到 token 的完整旅程；随后补 C06 的管理和展示。
4. **异常交互：** 修 C05，用真实服务响应驱动原始 Octop 消费者断言按钮及状态。
5. **证据与交付：** 修 C07，补 A 项负例、存量升级及双 App，形成新的 Gate A 结论；然后开展 Gate B。

复用已有正确能力，不重新引入 Casdoor 强制身份链路。所有实现、新迁移、测试和报告统一通过 PR 合入 develop/v3.0.1。

## 9. 完成定义

- C01–C04 的核心阻断已修复并有真实路由回归。
- C05／C08 等 Gate A 必做项关闭。
- 既有正向测试保持通过，并新增对窄 token、跨 client、停用／撤销、首登、动作及迁移的有效断言。
- 相关 lint、typecheck、test、build 独立完成，命令与环境可复现。
- 必做 A 项无 FAIL／PARTIAL／NOT RUN；之后才认定 Gate A 通过。
- Gate B 由真实系统、目标浏览器、Host、数据库和恢复证据单独判定。
- HR／CRM 等实际 App 仍不进入本期范围。

## 10. 固定参考

- [检查提交](https://github.com/smc-copilot/nocobase/commit/736f93227ffefe323ba26963be2687e8ad130e35)
- [V2.0 PRD](https://github.com/smc-copilot/nocobase/blob/736f93227ffefe323ba26963be2687e8ad130e35/prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md)
- [Agent Authorization 代码](https://github.com/smc-copilot/nocobase/tree/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-agent-authorization)
- [Adapter 代码](https://github.com/smc-copilot/nocobase/tree/736f93227ffefe323ba26963be2687e8ad130e35/packages/plugins/app-plugin-business-ui-adapter)
- [开发分支](https://github.com/smc-copilot/nocobase/tree/develop/v3.0.1)

本报告针对固定提交；后续提交必须附新增回归证据，不能将本报告结论自动套用于新代码。
