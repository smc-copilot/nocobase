import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ...fileUi,
  identity: {
    bindings: '身份绑定',
    bindingsDescription:
      '按可信工号把 Casdoor 的 issuer 与 subject 绑定到本地用户名。邮箱不会自动合并账户。',
    isolationTitle: '外部身份绑定',
    bindingIsolation:
      '预览并提交时，按工号把 Casdoor 的 issuer 与 subject 绑定到本地用户名。邮箱不会自动合并账户。',
    bindingCommitted: '绑定已提交',
    bindingFailed: '无法预览或提交绑定。',
    bindingPreview: '预览或提交 JSON',
    preview: '预览',
    commit: '提交',
    issuer: '签发方',
    subject: '主体',
    localUserId: '本地用户',
    noBindings: '还没有 issuer 与 subject 绑定。',
  },
};

export default zhCN;
