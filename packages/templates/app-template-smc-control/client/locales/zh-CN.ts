import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ...fileUi,
  agentAuthorization: {
    title: '智能体授权',
    description: '登记接入应用、查看授权，并阅读授权审计。',
    clients: '接入应用',
    clientsDescription: '创建接入应用、轮换密钥，以及启用或停用。',
    grants: '授权',
    grantsDescription: '有效和已撤销的授权。',
    audit: '审计',
    auditDescription: '接入应用变更和授权撤销。',
    name: '名称',
    instanceLabel: '实例',
    redirectUri: '回调地址',
    scopes: '范围',
    scope: {
      'business-ui:view': '查看业务界面',
      'business-ui:edit': '编辑业务界面',
    },
    status: '状态',
    enabled: '已启用',
    disabled: '已停用',
    actions: '操作',
    create: '创建接入应用',
    rotate: '轮换密钥',
    enable: '启用',
    disable: '停用',
    revoke: '撤销',
    secretOnce: '请立即复制此密钥。它不会再次显示。',
    empty: '暂无记录。',
    requestFailed: '请求失败。',
    client: '接入应用',
    user: '用户',
    audience: '受众',
    expires: '到期时间',
    noExpiry: '不过期',
    grant: '授权',
    when: '时间',
    action: '动作',
    decision: '决定',
  },
};

export default zhCN;
