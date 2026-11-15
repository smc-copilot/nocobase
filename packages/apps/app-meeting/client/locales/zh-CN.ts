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
      '后续版本将查询已授权的腾讯会议、导入资料并把纪要同步到 OA。本版本提供登录、角色和一个按授权隔离的空会议列表。',
  },
  meetings: {
    title: '会议',
    empty: '还没有会议。本版本不查询会议网关。',
    untitled: '未命名会议',
    notProvided: '未提供',
    queryNotConnected: '此列表只显示已经为你保存的会议，不会查询会议网关。',
    columns: {
      title: '名称',
      meetingCode: '会议号',
      createdAt: '创建时间',
    },
  },
};

export default zhCN;
