# NocoBase 独立多 Agent 授权与 Business UI：代码完整性复检

- 审查日期：2026-11-14（Asia/Shanghai）。
- 仓库与分支：`smc-copilot/nocobase`，`develop/v3.0.1`。
- 本次固定提交：[`4690a51fde0ab1466ea79aa1e368ca6d4113519b`](https://github.com/smc-copilot/nocobase/commit/4690a51fde0ab1466ea79aa1e368ca6d4113519b)。
- 上次审查基线：`736f93227ffefe323ba26963be2687e8ad130e35`。
- 功能实现提交 `440fdbf5` 的说明：`fix(agent-authorization): close Gate A integrity defects C01-C08`。
- 收尾更新：`4690a51f` 仅修改 Gate A 验收文档；已确认其与 `440fdbf5` 的产品代码、测试、脚本和依赖文件完全一致。
- 对比范围：49 个文件，新增 3,555 行、删除 227 行；另检查相关原生账号、授权及 App 装配代码。
- 需求基线：仓库 `prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md` 与上一轮完整性检查。

## 1. 审查结论

**本轮修复有效，但尚未达到 Gate A 全部通过标准。已复现 3 个关键遗留问题：1 个 P0、2 个 P1；另有 1 个 P2 控制面页面完整性缺口。**

本次代码已经修复跨 client 查询／重试越权、新签发票据的 token scope 扩权、客户端停用期间的 embed 写入、用户停用期间的刷新与兑换等问题。Control 也已装配 Agent Authorization 插件，并新增接入应用、授权和审计页面。

仍然阻止完整验收的情况是：

1. 旧版、没有 scope 快照的 embed 在升级后仍可写入，原只读 token 的限制无法恢复。
2. client 重新启用后，停用前的旧 embed 可以恢复保存。
3. 本地用户重新启用后，禁用前的旧 access token、refresh token 可以恢复有效。

因此，仓库 `prd/acceptance/gate-a-v2-report.md` 中“C01–C08 已全部关闭、A01–A24 PASS”的结论需要修正。可继续进行隔离开发环境中的功能联调和缺陷复测；不能将当前提交标为完整验收通过，也不宜据此升级有存量授权数据的正式环境。

## 2. 本次使用的需求边界

| 项目            | 本次判定标准                                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| NocoBase 身份   | 独立本地账号；不要求 Casdoor 或外部 Agent 可用                                    |
| 外部 Agent 接入 | 支持多套系统各自的 `client_id`、`client_secret` 和用户授权                        |
| 用户身份确认    | 通过 NocoBase 登录与 consent；不强制按 Octop subject 预绑定                       |
| Casdoor         | 可选登录来源；不作为本期授权服务的强制依赖                                        |
| 用户权限        | 用户授权、token scope、client 范围和当前业务权限均需生效                          |
| 本期业务范围    | 控制面、通用授权、Business UI Adapter、通用测试表单                               |
| 排除范围        | HR、CRM 等实际业务 App                                                            |
| Octop           | 固定协议参考版本 `64689a5b9863d974783f0605ed7673a7d5f73b22`；本次未运行真实桌面端 |

本次遗留问题依据既有 AUTH-05、A16 和存量升级要求判定，并未新增 Casdoor 绑定、外部主体预绑定或每次操作重新 consent 等要求。

## 3. 已验证的修复与实现状态

| 上轮项                                             | 本次状态                           | 证据与边界                                                                                                            |
| -------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C01：跨 client interaction／operation 查询与 retry | 已修复原复现路径                   | A 的 interaction／operation 被 B 的只读 token 查询、重试，三个请求均返回 HTTP 403                                     |
| C02：只读 token 获取编辑能力                       | 新签发链路已修复，存量链路未关闭   | 新版只读 token 请求编辑票据返回 403；旧 embed 仍可写，见 R01                                                          |
| C03：client 停用与旧凭证恢复                       | 部分修复                           | 停用期间 token 与 embed 均被拒绝；重新启用后旧 token 仍被拒绝，但旧 embed 恢复，见 R02                                |
| C04：登录回跳参数及 App base path                  | 代码／路由复测通过                 | 使用原生 `redirect`，增加 SPA authorize 恢复页；`/main` 前缀下 login、consent 路由正确；真实浏览器登录旅程仍属 Gate B |
| C05：UNKNOWN／FAILED 回执按钮                      | 自动测试通过                       | UNKNOWN 可查询；可安全重试的 FAILED 可 retry；使用固定 Octop `receipt.py` 的 `buttons_for` 校验                       |
| C06：Control 页面、consent、审计                   | 已新增主要结构，页面尚有缺口       | Control 有插件装配和 clients／grants／audit 页；管理操作增加审计；接入应用可配置字段仍不齐，见 R04                    |
| C07：验收证据                                      | 已补充，但总通过结论不成立         | 新回归测试确实存在并通过；最新文档已确认命令退出码，但 A16、存量 scope 升级仍未被正确覆盖                             |
| C08：禁用用户刷新／兑换                            | 禁用期间已修复，重新启用边界未关闭 | `requireUsable` 检查用户状态；启用后旧 token 复活，见 R03                                                             |
| 无 Casdoor 启动和授权装配                          | 自动测试通过                       | 新增 `agent-auth-without-casdoor.test.ts`，在未装配 Casdoor 插件及集合的条件下启动核心链路                            |
| 通用表单与控制面回归                               | 本次选定测试全部通过               | 见第 5 节；未接入 HR／CRM                                                                                             |

## 4. 尚需修复的问题

### R01 · P0：升级后的旧 embed 缺失 scope 快照，仍按当前完整 grant 放行写入

**影响：** 新版修复了新票据的 scope 交集，却没有封住已经落库的旧票据／embed。旧 token 原本仅有 `business-ui:view`，而同一 grant 允许 edit 时，旧版产生的编辑 embed 在新版仍可保存。

**代码位置：**

- [embed scopes 迁移](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-business-ui-adapter/database/migrations/business_ui_adapter_202611160001_embed_scopes.ts#L4)：只增加可空字段，历史行保持 null，并明确采用当前 grant∩client 回退。
- [scope 解析与回退](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L519)：null、非数组及不可解析数据被视为无快照；`withRecordedScopes` 随后清除 `tokenScopes`。
- [embed 访问检查](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L645)：直接使用上述回退检查 action。
- [旧 ticket 兑换的同类回退](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts#L1212)：缺少 `context.scopes` 时使用当前 grant。

**实测方式及结果：** 从 Git 提取 `736f9322` 的原始 Adapter 服务代码，在隔离 SQLite 上使用旧版签发、兑换逻辑生成存量同形记录，再由 `4690a51f` 的生产协议路由处理保存请求。没有人工把一个新版只读 embed 改成可写。

```json
{
  "producerVersion": "736f9322",
  "tokenScopesAtIssue": ["business-ui:view"],
  "persistedScopes": null,
  "consumerVersion": "4690a51f",
  "saveHttp": 200,
  "status": "draft"
}
```

这验证了历史数据形态的漏洞；它不是生产数据库逐版本迁移演练。新签发只读 token 请求编辑票据返回 403，说明缺口集中在兼容旧数据的路径。

**修复要求：** 无法证明原始 scope 的 ticket／embed 应失效并引导重新打开，或通过可核验的原始凭证记录恢复严格范围。不能将当前 grant／client 的较大范围当作原 token 范围。迁移应保留正式业务记录、归属和历史回执，同时失效不可信的临时授权上下文；不要删除用户或业务单据。

**验收：** 升级前无 scope 的 ticket、embed，及 malformed scope，均不能通过宽松回退恢复写权限；用户重新取得合规票据后能继续操作原单据，历史回执保持可追溯。

### R02 · P1：client 重新启用后旧 embed 恢复可写

**影响：** 管理员停用 client 会撤销 access／refresh token，但已兑换的浏览器 embed 没有持久失效。只要会话、embed 和 grant 尚未过期且业务权限仍满足，重新启用 client 后旧窗口可继续保存。

**代码位置：**

- [client 停用逻辑](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-agent-authorization/server/services/clients.ts#L154)：只撤销 `agentTokens`，没有同步使其他授权上下文失效。
- [grant 可用性检查](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-agent-authorization/server/services/grants.ts#L232)：检查当前 `enabled` 和既有 grant revision，无法识别“曾被停用”。
- [当前回归测试](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-business-ui-adapter/tests/server/client-lifecycle.test.ts#L70)：重新启用后只检查旧 access token，再签新票据；没有再次使用旧 embed。

**实测：**

| 步骤                                  | 当前结果          | 预期             |
| ------------------------------------- | ----------------- | ---------------- |
| 有效 token 换票并形成 embed           | 成功              | 成功             |
| client 停用后用旧 cookie 保存         | HTTP 403          | 拒绝             |
| client 重新启用后解析旧 access token  | 无效              | 继续无效         |
| client 重新启用后用同一旧 cookie 保存 | HTTP 200，`draft` | 继续拒绝旧 embed |

**修复要求：** 将 client 停用产生的授权失效版本覆盖授权码、token、ticket 和 embed，或等价地持久撤销这些临时凭证。只在访问时检查当前 enabled 不足以满足 AUTH-05／A16。重新启用后可以签发新版本，但不能恢复旧上下文。

**验收：** 停用→重新启用之后，旧 token、未消费旧授权码、旧 ticket、旧 embed 均不能复活；新授权链路可用；同一用户的 client B 与直接登录 NocoBase 不受 client A 停用影响。

### R03 · P1：本地用户重新启用后旧 access／refresh token 恢复有效

**影响：** 本地账号禁用目前相当于临时冻结自建 Agent token。重新启用账号会恢复禁用前仍未过期的 opaque token，违背 PRD“重新启用／重新授权生成新的有效版本，不使旧凭证复活”的明确要求。

**代码位置：**

- [原生账号禁用／启用](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-authentication/server/user-administration.ts#L331)：禁用撤销原生 sessions；启用清除 `disabledAt`。
- [access token 解析](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-agent-authorization/server/services/oauth.ts#L295)：依赖 token 未撤销、当前用户状态及 grant revision；没有用户禁用后持续生效的失效标记。
- [refresh 检查](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-agent-authorization/server/services/oauth.ts#L228)：重新启用后同样可以使用旧 refresh token。
- [错误的回归预期](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/plugins/app-plugin-agent-authorization/tests/server/lifecycle.test.ts#L175)：当前测试明确期待用户启用后旧 refresh token 成功，因此“测试全绿”没有验证需求边界。

**实测：** 使用原生账号管理服务禁用、启用本地用户，随后通过实际 OAuth 路由刷新，得到：

```json
{
  "oldAccessRejectedWhileDisabled": true,
  "oldAccessRevivedAfterEnable": true,
  "oldRefreshAfterEnableHttp": 200
}
```

**修复要求：** 通过用户禁用事件、授权安全版本或等价机制，持久失效该用户的 Agent 凭证。保持原生账号模块与 Agent 插件可选装配的边界，不应为此引入 Casdoor 依赖。调整现有 lifecycle 测试，旧凭证恢复成功应成为失败条件。

**验收：** 禁用期间拒绝；启用后旧 token、旧 refresh、旧授权码等仍拒绝；新登录／新有效授权链路成功。不得仅以调用时 `disabledAt` 为 null 判定历史凭证重新有效。

### R04 · P2：Control 接入应用页只交付了基础操作，未覆盖全部登记配置

**已实现：** 名称、实例标识、单个 Redirect URI、scope 的创建；列表展示；启停；密钥轮换；授权列表撤销；审计列表。

**缺口：** AUTH-02 要求的描述、Origin、凭证认证方式等，后端 schema／API 已有相应能力，但 [clients 页面](https://github.com/smc-copilot/nocobase/blob/4690a51fde0ab1466ea79aa1e368ca6d4113519b/packages/templates/app-template-smc-control/client/pages/settings/agent-authorization/clients.tsx#L31) 未提供完整配置入口；已建 client 也没有编辑名称、Redirect URI、scope 等入口。页面创建固定走默认认证方式。

这是管理页面的交付缺口，不等同于后端 API 缺失。已有的路由和装配测试也不能证明上述页面操作已经完成。

**修复要求及验收：** 补齐 PRD 已要求的登记字段和编辑流程，校验多 URI／Origin、展示认证方式，沿用现有管理权限和 secret 一次性交付行为；验证管理员在页面完成创建、编辑、轮换、停用、查看授权及审计。若本期明确接受部分高级字段仅通过管理 API 配置，应在验收文档中明确记录，不能将 GUI 全功能交付标为完成。

## 5. 本次执行的检查与结果

262 项测试和 12 项静态／构建检查实际执行于 `440fdbf5`。随后远程新增 `4690a51f`，仅更新验收文档，未改变任何产品实现、测试或依赖；本次核对完整差异后保留这些有效证据，并在最新 HEAD 再次执行第 5.4 节边界复测。未为仅文档更新重复运行整套测试。

### 5.1 测试：57 个文件、262 项通过

| 范围                            | 命令（在对应 package 执行）                                                                                                                    | 文件／测试 | 结果 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| Agent Authorization             | `pnpm test`                                                                                                                                    | 11／21     | PASS |
| Business UI Adapter             | `pnpm test`                                                                                                                                    | 10／33     | PASS |
| Integration Demo 全部服务端测试 | `pnpm exec vitest run tests/server`                                                                                                            | 17／93     | PASS |
| SMC Control 全部服务端测试      | `pnpm exec vitest run tests/server`                                                                                                            | 16／94     | PASS |
| Control 路由、装配、导航        | `pnpm exec vitest run tests/client/client-routes.test.ts tests/client/foundation-integration.test.ts tests/client/settings-navigation.test.ts` | 3／21      | PASS |

这不是整个 NocoBase 仓库的全量测试，也不是浏览器 E2E。服务端数据库测试按 package 顺序执行，未让不同 package 并发争用同一测试数据库。

### 5.2 静态检查与构建

四个相关 package 的 12 项 lint／typecheck／build 检查全部退出码为 0。

| Package                                    | lint | typecheck | build |
| ------------------------------------------ | ---- | --------- | ----- |
| `@nocobase/app-plugin-agent-authorization` | PASS | PASS      | PASS  |
| `@nocobase/app-plugin-business-ui-adapter` | PASS | PASS      | PASS  |
| `@nocobase/app-template-smc-control`       | PASS | PASS      | PASS  |
| `@nocobase/app-template-integration-demo`  | PASS | PASS      | PASS  |

执行形式为 `pnpm --filter <package> lint`、`typecheck`、`build`，各命令独立执行并检查退出码。Control 执行完整构建，包括 workspace 依赖构建、App 自身前后端检查与打包、生产依赖安装和产物依赖校验。Demo 构建使用仓库支持的 `NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD=1`，复用本轮已准备的 workspace 依赖；Demo 自身类型检查、前后端构建、生产依赖安装与产物校验仍实际执行。插件构建均实际执行。

两套 App 的构建产物针对本机 Linux x64／Node 24，不能代替其他目标平台部署验证。Vite 的大 chunk 提示不影响本次构建成功。

### 5.3 依赖与仓库检查

| 检查                                              | 结果                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-scripts` | PASS；98 个 workspace 项目，未更改锁文件                                |
| `pnpm peers:check`                                | PASS；51 个 package 无 peer 依赖违规                                    |
| `node scripts/validate-changesets.mjs`            | PASS；1,661 个文件                                                      |
| 远程分支与本地审查 SHA                            | 一致，均为 `4690a51fde0ab1466ea79aa1e368ca6d4113519b`                   |
| GitHub combined status 查询                       | 返回空 statuses，不能据此声称远程 CI 已通过                             |
| 提交关联 PR workflow 查询                         | 返回空列表；该接口仅覆盖关联 PR 运行，不能据此断言所有 Actions 均不存在 |

运行环境为 Linux、Node `24.22.1`、pnpm `11.25.0`；仓库声明 pnpm `11.7.0`，因此本次不是该精确 pnpm 版本的复现。测试生成的 Python 缓存已清理，最终 `git status --short` 为空、`git diff --check` 通过。无产品代码修改、提交或推送。

### 5.4 独立边界复测结果

复测使用真实 SQLite、原生 Authentication／Authorization、生产 OAuth／Business UI 协议路由；最小容器装配用于接入服务。测试创建的用户、client 和通用单据均在隔离环境，不调用真实 Octop。

| 检查                                            | 实际结果                                | 判定           |
| ----------------------------------------------- | --------------------------------------- | -------------- |
| 新只读 token 申请 edit ticket                   | 403，无票据                             | 原缺陷修复     |
| B 读取 A interaction                            | 403                                     | 原缺陷修复     |
| B 查询 A operation                              | 403                                     | 原缺陷修复     |
| B retry A operation                             | 403                                     | 原缺陷修复     |
| client 停用后旧 embed 保存                      | 403，GRANT_REQUIRED                     | 原缺陷修复     |
| client 重启用后旧 access token                  | 无效                                    | 原缺陷修复     |
| client 重启用后旧 embed 保存                    | 200，draft                              | R02 未修复     |
| 736 旧逻辑生成的无 scope embed 在最新 HEAD 保存 | 200，draft                              | R01 未修复     |
| 用户禁用期间旧 access token                     | 无效                                    | 原缺陷修复     |
| 用户启用后旧 access token                       | 有效                                    | R03 未修复     |
| 用户启用后旧 refresh token 走 token 路由        | 200                                     | R03 未修复     |
| `/main` 下匿名 authorize                        | 302 至 `/main/login?redirect=...`       | 路由修复       |
| 原生 guest guard 登录后目的地                   | `/agent-authorization/authorize?...`    | 恢复桥接正确   |
| 已登录 authorize consent 目的地                 | `/main/agent-authorization/consent?...` | base path 正确 |

## 6. Gate A 与 Gate B 的真实状态

| 验收项                        | 本次判断                                | 原因                                                                          |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| A01：无 Casdoor 核心链路      | 自动化证据通过                          | 新增无 Casdoor 装配与协议测试                                                 |
| A03：首登与回跳               | 代码／路由证据通过                      | 原生 redirect 及恢复路由正确，真实浏览器旅程待 Gate B                         |
| A10：跨 client 隔离           | 原复现路径通过                          | query／retry／interaction 三个入口均拒绝                                      |
| A14：client 停用即时失效      | 本次复测通过                            | 停用期间 token 与旧 embed 写入均拒绝                                          |
| A15：用户禁用即时失效         | 本次复测及测试通过                      | 禁用期间拒绝解析、刷新与兑换                                                  |
| A16：重新启用旧凭证不复活     | FAIL                                    | R02、R03                                                                      |
| A17：多 App 边界              | 有 audience 单测证据，真实多 App 待验证 | 新增测试是同一 DB 上的两套 service audience，不等同于双 Host／双 App 部署     |
| A19：UNKNOWN／FAILED 恢复按钮 | 自动化证据通过                          | 固定 Octop consumer 函数校验通过                                              |
| A21：控制面管理               | 基础功能已装配，完整页面部分完成        | R04；未运行页面交互 E2E                                                       |
| A22：存量升级                 | 尚不通过                                | migration up/down 通过不代表历史授权安全；R01 复现成功                        |
| A24：撤销                     | 保留已有兼容说明，真实客户端待验证      | Octop 固定插件可能省略 revoke 的 client_secret；本地断开不等于远端 grant 撤销 |
| Gate A 总结论                 | 未全部通过                              | 安全／生命周期缺口仍在                                                        |
| Gate B 总结论                 | 本次未执行                              | 缺真实 Octop、HTTPS 浏览器及目标部署证据                                      |

其他已存在测试通过的功能不因上述失败被否定；但不能用总体测试数量替代遗漏边界的验收。

## 7. 下一步完成顺序

1. 先修 R01：明确并实现旧票据／embed 的安全迁移，停止缺 scope 时的权限放大回退。
2. 一并修 R02、R03：统一 client／用户生命周期的持久失效策略，覆盖所有临时凭证；替换与 A16 冲突的测试预期。
3. 补 R04 的控制面登记／编辑能力，或如实记录经确认的 API 配置边界；更新 Gate A 文档，逐项附真实证据。
4. 对上述场景新增针对性回归，并重新执行本报告已通过的相关测试、静态检查和构建；不要扩大到 HR／CRM。
5. Gate A 无阻断后，用真实 Octop 和第二套通用 Agent 客户端进入 Gate B：本地账号登录、同意／拒绝、通用表单保存／提交、只读详情、UNKNOWN 查询、FAILED 重试、隔离与撤销。

Gate B 还需验证 HTTPS iframe Cookie／CSP／Origin、目标数据库、in-process／Docker、双 Host／多 App、备份恢复和密钥轮换。当前没有证据把这些项目标为通过。

## 8. 复检使用的源文件索引

| 主题                         | 路径                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| V2.0 需求基线                | `prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md`                                                       |
| 当前 Gate A 声明             | `prd/acceptance/gate-a-v2-report.md`                                                                                   |
| client 与 grant 生命周期     | `packages/plugins/app-plugin-agent-authorization/server/services/clients.ts`、`grants.ts`                              |
| OAuth 与 token               | `packages/plugins/app-plugin-agent-authorization/server/services/oauth.ts`                                             |
| 本地账号启停                 | `packages/plugins/app-plugin-authentication/server/user-administration.ts`                                             |
| Adapter scope／ticket／embed | `packages/plugins/app-plugin-business-ui-adapter/server/services/protocol.ts`                                          |
| Adapter 原生装配             | `packages/plugins/app-plugin-business-ui-adapter/server/providers/business-ui-adapter.ts`                              |
| scope 存量迁移               | `packages/plugins/app-plugin-business-ui-adapter/database/migrations/business_ui_adapter_202611160001_embed_scopes.ts` |
| Control 接入应用页面         | `packages/templates/app-template-smc-control/client/pages/settings/agent-authorization/clients.tsx`                    |
| 用户生命周期回归             | `packages/plugins/app-plugin-agent-authorization/tests/server/lifecycle.test.ts`                                       |
| client／embed 生命周期回归   | `packages/plugins/app-plugin-business-ui-adapter/tests/server/client-lifecycle.test.ts`                                |

所有源文件结论均针对本报告固定 SHA；后续提交应重新固定版本后复核。
