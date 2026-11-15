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
      '绑定会议网关、查询已授权会议并查看已入库详情。OA 导入与同步不在本版本。',
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
};

export default zhCN;
