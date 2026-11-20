import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ...fileUi,
  navigation: {
    ...systemZhCN.navigation,
    home: '员工门户',
  },
  portal: {
    title: '员工应用门户',
    description:
      '打开 Casdoor 已授权给当前账号的应用。下方隔离夹具已标注，不是真实身份源联调。',
    isolationTitle: '本地隔离测试 — 非真实 Casdoor 联调',
    isolationBody:
      '下方授权卡片来自 contractFixture 授权和示例目录，不展示 token 或 secret。',
    authorized: '已授权应用',
    authorizedHint: '打开前会再次核对 Casdoor 授权、启用状态和健康检查。',
    autoLaunchDisabled: '不自动打开',
    autoLaunchIfSingle: '仅一个应用时打开',
    autoLaunchDefault: '打开默认应用',
    empty: '当前账号没有已授权应用。',
    open: '打开',
    setDefault: '设为默认',
    defaultApp: '默认应用',
    launchOpened: '已打开 {{name}}',
    launchFailed: '无法打开该应用。',
    prefsSaved: '启动偏好已保存',
    defaultSaved: '默认应用已保存',
    prefsFailed: '无法保存偏好。',
    userConfigHint: '本地用户与权限在系统设置中管理。',
    userConfigLink: '用户管理',
    catalogNotAccess:
      '保存目录 URL 不会扩大部署允许名单，也不会授予 Casdoor 访问。以下为隔离夹具。',
    catalogSaved: '已保存目录应用',
    catalogFailed: '无法保存目录应用。',
    catalogCreate: '新增目录应用',
    appCode: '应用编码',
    appName: '名称',
    appType: '类型',
    baseUrl: '基础 URL',
    bindingIsolation:
      '预览/提交按工号将 Casdoor issuer+sub 绑定到本地用户名，不会按邮箱自动合并。示例数据为隔离夹具，非真实联调。',
    bindingCommitted: '绑定已提交',
    bindingFailed: '无法预览或提交绑定。',
    bindingPreview: '预览 / 提交 JSON',
    preview: '预览',
    commit: '提交',
    issuer: '签发方',
    subject: '主体',
    localUserId: '本地用户',
    noBindings: '还没有 issuer+sub 绑定。',
    auditHint: '审计只记录动作、结果和原因。隔离夹具不是真实身份源流量。',
    when: '时间',
    actor: '操作者',
    action: '动作',
    result: '结果',
    reason: '原因',
    noAudit: '暂无审计事件。',
  },
};

export default zhCN;
