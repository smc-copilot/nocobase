# NocoBase 独立身份与多 Agent 系统授权 PRD

> **版本：V2.0｜授权架构纠偏版**  
> **日期：2026-11-14（北京时间）**  
> **开发仓库：smc-copilot/nocobase；统一合并目标：develop/v3.0.1**  
> **代码核查参考：a7ddec85c484e07c83f80dd175c55dc05f135302**  
> **Octop 消费者参考：64689a5b9863d974783f0605ed7673a7d5f73b22**  
> **性质：按用户最新要求修正产品边界与验收基线，不代表新授权能力已经实现。**

## 1. 本次纠偏结论

NocoBase 是独立的业务应用与权限系统，拥有自己的用户、登录、权限和业务数据。它可以与多套 Agent 系统建立独立的客户端信任关系，不依赖 Casdoor，也不以 Octop 作为唯一入口。

每套外部 Agent 系统在 NocoBase 注册接入应用，取得自己的 client_id 和 client_secret。Octop 用户同时拥有一个 NocoBase 本地账号，使用时登录 NocoBase、确认授权，随后由 Octop 在用户授权范围内访问表单和数据。

Casdoor 只能作为可选登录源。未部署、未启用或不可用的 Casdoor，不能阻止 NocoBase 本地用户使用上述授权链路。

此前方案将 Casdoor 首登、目录同步和主体预绑定设为强制前提，偏离了这个边界。本文件替代旧 PRD 中与此冲突的身份、授权和验收要求。

## 2. 与旧方案的差异

| 事项             | V2.0 正确边界                                  | 对原要求的处理                     |
| ---------------- | ---------------------------------------------- | ---------------------------------- |
| 用户账号         | NocoBase 独立维护本地账号                      | 保留原生 Users、登录与权限管理     |
| 外部系统接入     | 每套系统／实例独立注册 client                  | 替代单一 Casdoor 资源 token 准入   |
| 用户授权         | 本地登录后向指定 client 授权                   | 替代必须先经 Casdoor 创建身份      |
| Octop 用户关联   | 通过用户授权建立访问关系                       | 取消管理员预导入主体绑定的强制要求 |
| 身份目录同步     | 可选企业功能                                   | 从核心 Gate A 中移除               |
| Casdoor 权限映射 | 可选集成功能                                   | 不再作为默认权限来源和核心准入要求 |
| 生效权限         | 本地当前权限、用户同意、client 范围共同约束    | 继续使用原生 Authorization         |
| 撤销             | 用户授权、client、本地账号及业务权限分别可撤销 | 不再依赖 Casdoor Provider 状态     |
| Business UI 协议 | 继续复用现有表单、票据、回执和恢复协议         | 不为身份纠偏重写交互协议           |
| 多系统           | Octop、其他 Agent 平台均可分别接入             | 不建立以 Octop 命名的通用授权核心  |

本文件仅替代身份与授权相关冲突条款。控制面发布、通用表单、只读详情、幂等提交、权威回执、UNKNOWN 恢复、部署及备份等仍按既有范围交付。

## 3. 范围

### 3.1 本期范围

1. NocoBase 接入应用管理：client 注册、凭据、范围、启停与轮换。
2. NocoBase 本地用户登录、用户同意授权及授权管理。
3. 由 NocoBase 管理的授权码、访问凭证、刷新及撤销能力。
4. Business UI Adapter 的通用客户端与用户授权接线。
5. Octop 现有 OAuth2 接入配置与通用表单联调。
6. 第二套通用 Agent 测试客户端，验证协议与系统隔离。
7. 解除核心链路对 Casdoor 插件及数据表的强依赖。
8. 新增迁移、回归、部署配置与修订后的验收报告。

### 3.2 范围保持不变

本期使用通用测试表单，不接入 HR、CRM、招聘、财务实际 App，不新增领域单据、审批、业务报表和领域导入。

复用当前 NocoBase V3 原生认证、Authorization／Permission Sets、Secret、Releases 与 App Host。通用跨系统授权模块可作为独立插件实现；包名和标准授权服务器组件选型在技术验证中确定，不要求改造认证内核。

Casdoor 适配器可以保留，但不是本期独立授权链路的安装和验收前置条件。旧 Casdoor 可选功能的已知问题不能标记为已修复；应另列可选功能清单。

## 4. 两层授权模型

### 4.1 系统身份

client_id 标识接入的 Agent 系统／实例；client_secret 用于验证该客户端的合法性。每套系统拥有独立凭据和允许范围，不能共享一组平台管理员凭据。

“系统通过鉴权”仅证明调用方是被注册的客户端，不产生某个员工的业务权限。

### 4.2 用户身份与同意

用户通过 NocoBase 本地登录确认自己的身份，再对指定 client、目标 App 和请求范围授予访问权。授权结果关联 NocoBase 的稳定本地 userId。

“用户同意”不能扩大该用户本来拥有的业务权限。每次业务访问按当前原生权限判断，不能只信任签发 token 时的权限快照。

**实际允许范围 = client 允许范围 ∩ 用户已同意范围 ∩ 用户当前 NocoBase 权限 ∩ 目标 App／记录／动作约束。**

### 4.3 各主体的含义

| 标识                       | 含义                         | 约束                                                 |
| -------------------------- | ---------------------------- | ---------------------------------------------------- |
| client_id                  | 一套外部系统／实例           | 在注册范围内唯一                                     |
| localUserId                | NocoBase 本地账号            | 由 NocoBase 认证确定                                 |
| grantId                    | 某用户对某 client 的授权记录 | 关联目标 App、scope、期限和撤销版本                  |
| connectionId               | Business UI 的协议连接       | 显式关联 client 和目标 App                           |
| external_subject           | 外部系统用户标识             | 可作 client 域内审计关联，不能选择或覆盖 localUserId |
| interactionId／operationId | UI 交互／业务操作            | 继续用于回执、幂等和恢复                             |

不要求两个系统数据库的 userId 一致，不按同名账号或同邮箱自动认定身份，也不要求建立全局一对一主体绑定。一个 NocoBase 用户可以分别授权多套 Agent 系统。

## 5. AUTH-01：NocoBase 独立账号

- 本地账号可通过现有管理员创建、受控注册或已有账号管理方式准备。
- Octop 用户在使用前持有 NocoBase 账号；账号是否同名由组织约定，授权时以 NocoBase 登录结果确认身份。
- 没有账号时提供清晰的注册／申请账号入口，不强制去 Casdoor 注册。
- 默认不根据 Agent 请求中的邮箱、userId 或 subject 自动创建本地高权限账号。
- 本地登录、修改密码、账号禁用、会话管理不依赖外部 Agent 或 Casdoor 可用性。
- Casdoor 等 SSO 如启用，只是本地登录的可选入口，不是用户业务授权的签发主体。

**验收：** 完全不配置 Casdoor，已注册本地用户仍可登录、授权并完成通用表单链路。

## 6. AUTH-02：接入应用注册与凭据管理

控制面提供“接入应用”页面，至少包含：

| 字段／操作              | 要求                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| 名称、描述、client_id   | 清晰标识外部系统与实例                                                 |
| client_secret           | 随机生成、受保护存储；创建／轮换时按原生秘密管理方式交付，不在列表回显 |
| 系统实例标识            | 区分 Octop 生产、测试以及其他 Agent 平台                               |
| Redirect URI            | 精确登记并校验，不允许任意回跳                                         |
| 允许 App／scope／Origin | 显式配置客户端可申请范围                                               |
| 凭证认证方式            | 按本节及 AUTH-03 配置                                                  |
| 启用／停用              | 停用后拒绝该 client 的新请求、刷新和授权                               |
| 密钥轮换                | 有清晰版本及旧凭据失效策略                                             |
| 授权统计与审计          | 查看该 client 下的用户授权和调用事件                                   |

客户端注册属于受原生权限保护的管理操作。普通表单用户不能自行创建平台级接入应用或扩大 client 范围。

## 7. AUTH-03：client_id／client_secret 鉴权协议

### 7.1 本期兼容方式

本期采用 OAuth2 客户端认证与用户委托授权表达跨系统接入。现有 Octop 的 token 请求已经发送 client_id 和 client_secret，NocoBase 应支持其实际使用的 client_secret_post，并可为其他客户端支持 client_secret_basic。每个客户端按登记方式认证，凭据不出现在 URL。

这里“验签／鉴权”的产品要求是验证跨系统调用方合法性。共享 client_secret 的认证与用户授权是两个不同检查；不能声称一组系统密钥等于员工访问授权。

若后续要求每个业务请求额外做 HMAC 签名，应作为明确的签名 profile 定义规范化请求、时间戳、nonce、防重放和密钥版本，并补调用端兼容。不能默认现有 Octop 已支持该请求签名格式，也不能将该扩展反过来变成 Casdoor 依赖。

### 7.2 系统访问与用户访问

- authorization_code＋PKCE：本期用户委托访问的主链路。
- refresh_token：按原始 client、用户授权和期限刷新，不扩大 scope。
- client_credentials：仅在需要系统级元数据／健康等权限时开放；不能直接操作某用户的单据。
- 用户业务请求使用用户授权访问凭证，不在每次业务 body 中传用户密码。
- client_secret 由 Agent 服务端或受保护网关保存；浏览器／iframe 使用受限会话或访问凭证。

### 7.3 Business UI 连接兼容

现有 Octop 的连接级握手／OAuth consume 使用连接服务凭据。保留其既有请求形状，并将 connectionId、受限连接凭据与接入 client 显式关联、统一管理及撤销。

不把 client_secret、连接服务凭据和用户 access_token 混用。连接级凭据只能完成固定协议允许的系统操作，不能冒充用户保存或提交。

## 8. AUTH-04：用户授权流程与页面

### 8.1 首次使用

1. 用户在 Octop 或其他 Agent 系统中选择使用 NocoBase 表单能力。
2. Agent 发起向 NocoBase 的授权请求，包含 client_id、精确 redirect_uri、state、PKCE challenge 和申请 scope。
3. 用户在 NocoBase 登录自己的本地账号。
4. NocoBase 展示接入应用名称、目标 App、请求能力及期限。
5. 用户同意或拒绝；同意后生成与 client、用户、App、scope 和 PKCE 关联的一次性授权码。
6. Agent 服务端使用 client_id、client_secret、授权码和 verifier 兑换用户访问凭证。
7. Agent 使用该凭证调用 Adapter；Adapter 从凭证得到本地身份及 grantId，执行当前业务授权。

用户可以分别授权多套 Agent 系统。已有有效授权可在原范围内复用；扩大请求范围时重新征得用户同意。这里的“使用时授权”不要求每次点击保存都重新弹窗。

### 8.2 授权管理

NocoBase 提供“我的已授权应用”页面，展示应用、目标 App、范围、期限和最近使用时间；用户可撤销指定应用授权。

管理员按原生权限查看、撤销或停用相关授权，但不能通过后台配置静默扩大用户已同意范围。

## 9. AUTH-05：由 NocoBase 管理访问凭证

NocoBase 独立承担本期授权服务职责，访问凭证不要求由 Casdoor 签发。

授权服务至少具备 authorize、token、revoke 及本地授权管理能力。路径沿用仓库 API 规范；实施前确定正式路径和接口文档，不将示意路径当作既有 API。

- 授权码单次、短时、绑定 client、redirect_uri 和 PKCE。
- 用户 access_token 关联 localUserId、client_id、目标 App／audience、scope、grantId、有效期和撤销版本。
- token 可以采用经验证的 JWT 或 opaque＋服务端查询；不能把未选定的格式当作已实现。
- refresh_token 受保护存储，刷新时重新检查 client、用户、grant 和当前策略。
- 用户、grant 或 client 被撤销后，相关凭证及已有 embed 在规定的下一次受保护访问中失效。
- 重新启用／重新授权生成新的有效版本，不使旧凭证复活。
- 授权服务器组件复用成熟、符合当前运行时的标准实现；现有 genericOAuth 是登录客户端接入能力，不可直接视为完整授权服务器。

### 9.1 多 App 边界

每份 grant 明确对应哪个 NocoBase App／身份域和资源 audience，不能将 Control 的登录会话直接当成所有业务 App 的授权。

可在控制面集中管理 client；授权服务在哪个 App／身份域签发凭证必须明确。grant、token、票据和审计始终携带目标范围；不能使用模块全局运行时使 App A 的登录／授权访问 App B 数据库。

## 10. AUTH-06：Adapter 与用户授权接线

### 10.1 输入及权限

- 从 NocoBase 签发或解析的用户凭证获取 localUserId、client_id、grantId、App 和 scope。
- 检查连接所属 client 与 token 中 client 一致；目标 App 和 audience 一致。
- 请求 body 的 Octop userId／subject 仅作为该客户端声明的外部关联信息，不作为本地身份选择依据。
- 本地账号未授权时返回授权所需状态；不要求管理员先导入 businessUiSubjectBindings。
- 原生 Authorization 仍判断真实表单、记录和动作。默认拒绝及跨记录、字段边界继续保留。
- 系统凭据不能通过伪造 subject 获得用户业务权限。

外部用户与 token 的归属由 Agent 系统安全保存和选择其用户凭证。需要额外外部 subject 锁定的系统可在 client 域内建立授权关联，但不能将其变成所有系统强制预绑定流程。

### 10.2 票据和 embed

ticket／embed 继续绑定用户、client、grant、目标 App、表单、记录、动作、nonce、有效期和安全版本。

每次访问检查本地账号、client、grant、连接、表单和当前原生权限。停用 A 系统只影响 A；用户撤销 A 的授权，不影响 B 或用户直接登录 NocoBase。

Adapter 不直接依赖 Casdoor issuer、Casdoor Provider、目录快照或 Casdoor 管理 token。安装并运行核心链路时，不需要 Casdoor 数据表存在。

### 10.3 回执能力保留

保留通用编辑／只读详情、保存与提交区分、单调回执序号、幂等提交、FAILED 安全重试和 UNKNOWN 查询恢复。

目前已发现的“异常回执只返回 close，缺少 query_status／retry”仍属于本期必修问题，与身份架构纠偏无关。

## 11. AUTH-07：Octop 兼容事实与接入配置

固定版本源码已核查：

- models.py 支持 oauth_authorize_url、oauth_token_url、oauth_revoke_url、oauth_client_id、oauth_client_secret、oauth_scopes。
- activation.py 可使用显式授权／token 地址；不是必须连接某个固定 IdP。
- token 兑换使用 authorization_code、redirect_uri、code_verifier、client_id，并在配置存在时发送 client_secret。
- refresh 请求也携带 client_id／client_secret。
- 用户凭证由 Octop 用户维度保存，后续业务请求使用该用户的 token。

因此可将授权／token 地址配置到 NocoBase 自身授权服务，不能继续以“Octop 需要 Casdoor”为架构前提。

| Octop 配置          | V2.0 对应                                                          |
| ------------------- | ------------------------------------------------------------------ |
| oauth_authorize_url | NocoBase 本地登录＋用户同意入口                                    |
| oauth_token_url     | NocoBase 用户 token 兑换／刷新入口                                 |
| oauth_client_id     | 在 NocoBase 注册的该 Octop 实例 client_id                          |
| oauth_client_secret | 对应 secret，保存在 Octop 受保护服务端凭据中                       |
| oauth_scopes        | 实际实现的 NocoBase scope；未提供 OIDC 时不沿用默认 openid/profile |
| Adapter base_url    | 对应该 client／App 的 Business UI 连接地址                         |

### 11.1 callback／consume

固定插件使用 Adapter 的 v1/oauth/callback 和 v1/oauth/consume 完成授权码中转。保留该契约时，需要将实际 client／connection 的精确回调地址登记在 NocoBase 授权服务，避免转向 Casdoor。

中转数据仍需连接隔离、一次消费、短时和安全存储；授权码的最终有效性由 NocoBase token 服务的 client、PKCE 和 redirect_uri 校验决定。

### 11.2 已知撤销兼容点

固定插件的注销分支尝试调用 revoke 时，只发送 token 与 client_id，未携带 client_secret。不能据此宣称它已兼容严格的 confidential-client token 撤销端点。

本期必须完成 NocoBase“我的已授权应用”撤销闭环。若要让 Octop 注销同步执行远端严格撤销，需单独列出最小插件兼容调整；该调整不涉及 Octop 核心或 Business UI 交互协议重写。

仅删除 Octop 本地凭证不等于 NocoBase grant 已撤销。验收分别记录本地断开、远端撤销和刷新失效结果。

## 12. AUTH-08：数据与迁移

下表为语义模型，不强制具体表名。

| 对象                | 必须保存的事实                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| 接入 client         | 名称、client_id、凭据版本、认证方式、允许 App／scope／URI、状态           |
| 用户 grant          | client、localUserId、目标 App、同意范围、期限、版本、撤销信息             |
| 授权码              | code 摘要、client／user／App／grant、PKCE、redirect_uri、有效期及消费状态 |
| token／refresh 会话 | grant 关联、用途、范围、到期与撤销事实，秘密受保护                        |
| Business UI 连接    | client 关联、目标 App、受限服务凭据、批准 Origin                          |
| ticket／embed       | client／grant／user、约束、版本、有效期                                   |
| 审计                | client、用户、grant、App、动作、权限结论及 interaction／operation 关联    |

迁移要求：

1. 使用新增迁移，不编辑已合并迁移。
2. 保留 NocoBase 现有用户、权限、正式单据和历史回执。
3. 旧 Casdoor identity 数据可保留为可选登录来源；不自动删除或覆盖本地身份。
4. 不把旧 Casdoor token、预绑定关系或系统 secret 自动升级成用户 consent。
5. 旧强绑定链路的用户在新流程中重新登录并授权；旧 ticket／embed 按迁移策略失效。
6. 通用授权表由通用模块持有，不继续放在必须安装 Casdoor 的迁移源中。
7. 不再以 Octop subject 和 localUserId 的全局一对一唯一性限制多系统授权。

## 13. AUTH-09：控制面与审计

必须交付三类管理入口：

- **接入应用管理**：client 注册、凭据轮换、范围、URI、启停与连接。
- **我的已授权应用**：用户查看及撤销自己的 grant。
- **授权运行与审计**：按权限查询 client、用户、grant、失败原因和业务关联。

账号管理和 Permission Sets 继续使用原生能力；Casdoor 配置出现在可选登录集成区域，不作为接入应用页面的上级必填步骤。

错误区分 client 无效、用户未登录、用户拒绝、grant 已撤销、scope 不足、业务无权、凭证过期和操作未知。不得统一重定向到 Casdoor 或要求同步目录后再使用本地账号。

## 14. AUTH-10：重新定义验收

### 14.1 Gate A：独立授权联调准入

完全不部署 Casdoor，仍能够完成：注册至少两个 client、准备本地用户、真实本地登录与同意、授权码兑换、刷新、用户与管理员撤销、原生权限判断、通用表单和消费者契约回归。

| ID  | 场景                                           | 必须结果                                            |
| --- | ---------------------------------------------- | --------------------------------------------------- |
| A01 | 无 Casdoor 配置／插件                          | 本地登录和核心授权链路可用                          |
| A02 | 注册 Octop 与 Agent-B 两个 client              | 独立凭据、范围和状态                                |
| A03 | 本地用户登录并同意                             | grant 关联正确 client／user／App                    |
| A04 | 用户拒绝／未注册账号                           | 无有效业务授权，提供正确入口或拒绝结果              |
| A05 | 错 client_secret／停用 client                  | token 兑换及后续适用请求拒绝                        |
| A06 | 授权码重放、过期、错误 PKCE／redirect_uri      | 拒绝，无有效重复凭证                                |
| A07 | 正常兑换与刷新                                 | 原 client、用户和范围不被扩大                       |
| A08 | 系统 client_credentials 或连接凭据访问用户单据 | 拒绝冒充用户                                        |
| A09 | 同用户授权两套系统                             | 两份授权可分别使用和撤销                            |
| A10 | A client 凭证／token 混入 B 连接               | 拒绝，App／audience 同样隔离                        |
| A11 | 修改 body 的 userId／subject                   | 不能改变本地身份及权限                              |
| A12 | native 权限撤销或跨记录访问                    | 下一次受保护请求拒绝                                |
| A13 | 用户撤销 A grant                               | A 的 token／refresh／ticket／embed 失效，B 保持有效 |
| A14 | 停用 A client                                  | A 受限，B 和本地登录不受影响                        |
| A15 | 本地账号禁用                                   | 该账号关联业务访问按当前策略拒绝                    |
| A16 | 重新启用／重新授权                             | 旧凭证不复活，新授权版本生效                        |
| A17 | 双 App 同进程授权／启停                        | 数据库和运行时不串用                                |
| A18 | 无预导入 Octop 主体表                          | 用户仍可完成授权和通用业务链路                      |
| A19 | FAILED／UNKNOWN                                | 真实消费者显示合法 retry／query_status，未知不重提  |
| A20 | 并发提交及丢响应                               | 最多一份业务副作用，可查询恢复                      |
| A21 | 管理页面／API 越权                             | 原生授权拒绝，Secret 不回显                         |
| A22 | 存量升级                                       | 用户、正式记录、归属和历史回执保留                  |
| A23 | 固定 Octop 授权请求原样消费                    | token 请求字段及 callback／consume 契约通过         |
| A24 | 注销与撤销                                     | 区分本地凭证删除与远端 grant 撤销，刷新结果真实可查 |

Gate A 使用受控标准 OAuth 客户端和真实 NocoBase Auth／Authorization／数据库；不能只测试内部 ensure 函数。

### 14.2 Gate B：真实系统验收

使用真实 Octop 和第二套通用 Agent 客户端完成用户登录、同意、表单交互、隔离与撤销；验证 HTTPS iframe、目标浏览器、in-process／Docker、目标数据库、备份恢复和轮换。

继续执行通用 A–F 业务场景。本地账号链路通过不需要 Casdoor 参与；可选 Casdoor 登录单独出具结果，不决定独立授权主链路是否可验收。

### 14.3 对上一轮评审结论的修正

- 将“Casdoor 浏览器首登必须通过”替换为“NocoBase 本地登录＋用户 consent 必须通过”。
- 将“Casdoor Provider／目录快照是每次业务访问前置”替换为“client／grant／本地账号／当前业务权限有效”。
- 将强制主体预绑定和全局一对一改为按 client 的用户授权。
- Casdoor 跨规则人工授权保护、目录同步等问题，若本期不启用这些可选功能，从核心 Gate A 阻断清单移出，另列已知限制。
- 多 App 全局运行时互相覆盖仍是架构隔离问题；新授权模块必须消除此类共享状态。
- 异常卡片动作、幂等、回执和真实测试证据继续作为本期要求。
- 旧 Gate A 结论基于强制 Casdoor 的错误基线，不能直接沿用为 V2.0 完成结论；按本表重新验收。

## 15. 实施顺序与交付

| 批次              | 工作                                               | 退出条件                     |
| ----------------- | -------------------------------------------------- | ---------------------------- |
| P1 解除强依赖     | 本地账号主链路、Casdoor 插件可选、通用授权数据归属 | 无 Casdoor 能启动和登录      |
| P2 接入应用与授权 | client 管理、本地 consent、token／refresh／revoke  | 两套 client 独立授权并可撤销 |
| P3 Adapter 接线   | 通用凭证、grant 约束、票据及 embed 版本            | 用户业务权限与跨系统隔离有效 |
| P4 协议与回归     | Octop 原始消费者、异常动作、幂等及升级             | 新 Gate A 全部通过           |
| P5 现场交付       | 真 Octop＋第二客户端、浏览器、Host 和恢复          | 新 Gate B 全部通过           |

交付件包括实现代码、新迁移、client／用户授权页面、通用 Demo、自动化测试、协议与接入说明、迁移手册、撤销及轮换手册和新 Gate A／B 报告，统一合入 develop/v3.0.1。

不得直接删除旧用户或在生产上切换授权模式。本文件交付仅修订需求；实施代码和迁移需按仓库流程完成并验证。

## 16. 当前代码与标准依据

代码检查参考 a7ddec85：模板当前以 Casdoor genericOAuth 和 Casdoor issued-credential 连接用户链路；已检查的授权模块中未见完整的 NocoBase 对外 authorize／token／consent 服务。因此，本轮重点是补齐独立授权服务与替换接线，不是继续把 Casdoor 适配做成所有系统的强制入口。

- [当前 NocoBase 代码基线](https://github.com/smc-copilot/nocobase/commit/a7ddec85c484e07c83f80dd175c55dc05f135302)
- [Octop OAuth 接入与 token 兑换实现](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/business_ui/activation.py)
- [Octop OAuth 配置字段](https://github.com/smc-copilot/octop/blob/64689a5b9863d974783f0605ed7673a7d5f73b22/plugins/business-ui/business_ui/models.py)
- [RFC 6749：OAuth2 角色、客户端认证、授权码和刷新](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 9700：OAuth2 安全最佳实践](https://www.rfc-editor.org/rfc/rfc9700)

上述标准用于协议设计和验证，不表示现有实现已经符合全部标准，也不扩大本期到通用企业身份平台建设。
