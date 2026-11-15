import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ...fileUi,
  navigation: {
    ...systemZhCN.navigation,
    meetings: '会议',
  },
  home: {
    ...systemZhCN.home,
    platform: '会议',
    title: '在本应用中处理会议',
    description:
      '绑定会议网关、查询已授权会议、编辑本地内容并准备 OA 草稿。在已发布写契约确认前，不会向真实 OA 写入。',
  },
  meetings: {
    title: '会议',
    empty: '还没有为你保存的会议。查询已绑定的网关后才会入库。',
    untitled: '未命名会议',
    notProvided: '未提供',
    loading: '加载中…',
    unavailable: '此会议不可用。',
    queryNotConnected:
      '此列表只显示已经为你保存的会议。使用「查询」才会调用已绑定网关；打开页面不会自动同步。',
    query: '查询',
    queryStart: '开始日期',
    queryEnd: '结束日期',
    queryStarted: '查询已完成',
    queryFailed: '会议网关查询未能完成。',
    detailDescription:
      '展示已入库的基本信息、人员和录制可用状态。未抓到的字段保持未提供。',
    participantsEmpty: '此会议还没有已保存的人员。',
    recordingsEmpty: '此会议还没有已保存的录制。',
    recordingAvailable: '录制可用',
    recordingUnavailable: '录制不可用',
    tabs: {
      overview: '概览',
      participants: '人员',
      recordings: '录制',
      oa: 'OA 工作区',
    },
    fetchStatus: {
      not_fetched: '尚未拉取',
      fetched: '已拉取',
      empty: '上游返回为空',
      failed: '拉取失败，已保留先前结果',
      not_provided: '未提供',
    },
    columns: {
      title: '名称',
      meetingCode: '会议号',
      createdAt: '创建时间',
      startedAt: '开始时间',
      endedAt: '结束时间',
      participants: '人员',
      recordings: '录制',
    },
  },
  meetingConnections: {
    title: '会议网关',
    description: '将本应用绑定到你已获授权的腾讯会议连接。令牌只保存在服务器。',
    binding: '当前绑定',
    bind: '绑定网关',
    select: '使用此连接',
    selected: '已选择连接',
    disconnect: '断开本应用',
    disconnected: '本应用不能再用旧凭据访问网关。',
    disconnectScope:
      '断开只阻止本应用后续远程访问，并不撤销上游腾讯或网关授权；本版不支持上游撤权接口。',
    noConnection: '尚未选择连接。',
    currentConnection: '已选连接：{{name}}',
    notConfigured: '会议网关来源地址和应用未配置，当前并未接通。',
    identityUnavailable:
      '首个网关访问令牌在已发布客户端中来自 account-login 与 token exchange。本应用不收集网关密码或粘贴 token，因此在该契约确认前无法发起真实 OAuth。',
    rootUnrestricted:
      '平台 root（unrestricted）可以读取全部已入库会议。普通管理员和成员不会因此获得他人会议的读取权。',
    completing: '正在完成网关授权…',
    status: {
      pending: '等待授权',
      awaiting_connection: '请选择已授权连接',
      active: '已连接',
      disconnected: '已断开本应用',
      identity_unavailable: '网关身份令牌不可用',
      not_configured: '网关未配置',
    },
  },
  meetingOa: {
    workspaceTitle: 'OA 工作区',
    workspaceDescription:
      '编辑本地 OA 草稿。保存不会调用 OA。正式同步是单独的命令。',
    isolationBanner: '本地测试数据，未调用真实 OA',
    mappingMissing:
      '没有可信工号映射。仍可保存合法草稿；正式同步不会向 OA 写入。',
    mappedAs: '当前登录身份映射到工号 {{employeeNo}}。',
    importContractMissing:
      '已发布网关客户端没有录制文件下载契约。本地内容仍可编辑。',
    importFailed: '录制导入失败。本地内容行已记录错误，源文未被覆盖。',
    localMinutesKept: '本地纪要修订与导入源文分开保存。',
    sourceTodos: '腾讯原始待办（不是已分派 OA 任务）',
    sourceTodosNotAssigned:
      '原始待办不会自动变成已分派任务，除非你添加带工号的草稿任务。',
    peopleSearch: '搜索 OA 人员',
    search: '搜索',
    peopleFailed: 'OA 人员搜索未能完成。',
    addTask: '添加分派任务',
    saveDraft: '保存草稿',
    submitSync: '提交 OA 同步',
    saveWritesZeroOa: '保存草稿对 OA 零写入。',
    draftSaved: '草稿已保存在本地。',
    draftFailed: '草稿未能保存。',
    syncFailed: 'OA 同步未被提交。',
    operationTitle: 'OA 执行',
    operationDescription:
      'GET 是纯读。UNKNOWN 步骤不会重发。Resume 只继续已确认未发送的工作。Recover 是核对标记未发送后的独立命令。',
    liveWriteBlocked: '真实 OA 写 HTTP 尚未发布。本页展示本地执行账本。',
    resume: '恢复未发送步骤',
    resumeFailed: '此执行不能恢复。',
    reconciliationTitle: 'OA 核对',
    reconciliationDescription:
      '只登记证据。核对不会写 OA。恢复是执行页上的独立命令，并保持冻结的创建人与载荷。',
    reconcileEmpty: '没有 UNKNOWN 或 PARTIAL 执行。',
    evidencePlaceholder: '关于该写入是否已发出的证据',
    markNotSent: '标记未发送',
    markUnknown: '标记已发送或未知',
    recover: '按冻结意图恢复',
    reconcileSaved: '证据已登记，未写入 OA。',
    reconcileFailed: '证据未能登记。',
    recoverFailed: '恢复未能继续。',
    integrationsTitle: '会议 OA',
    integrationsDescription:
      '用原生密钥封存 OA 凭据。root 不会成为默认可代办员工。密钥不会回显。',
    writeContract: '写契约：{{value}}',
    hasSecret: '客户端密钥：{{value}}',
    secretSealed: '已封存',
    secretMissing: '未保存',
    saveSettings: '保存配置',
    settingsSaved: '配置已保存。密钥不会返回。',
    settingsFailed: '配置未能保存。',
    mappingTitle: '可信工号映射',
    mappingHint:
      '将登录用户映射到 OA 工号。不要把平台 root 当作默认可代办员工。',
    saveMap: '保存映射',
    mapSaved: '映射已保存。',
    mapFailed: '映射未能保存。',
    fields: {
      title: '会议标题',
      summary: '待上传纪要',
      taskTitle: '分派任务标题',
      assignee: '责任人工号',
      status: '状态',
      requestId: '请求号',
      creator: '冻结创建人',
      steps: '步骤',
      tasks: '任务结果',
      tokenUrl: 'Token URL（在请求编码确认前不会发起）',
      peopleUrl: '人员搜索 URL',
      clientId: '客户端 ID',
      clientSecret: '客户端密钥（只写）',
      userId: '本地用户 ID',
      employeeNo: 'OA 工号',
    },
  },
};

export default zhCN;
