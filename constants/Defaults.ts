/**
 * 出厂预置值 —— 给不懂技术的用户免去遥控器输入长地址的痛苦。
 *
 * 电视端输入 https://tv.goldm.cc.cd 这种地址极其难打，所以这里把站点地址和
 * 登录凭据内建，首次启动自动登录；用户如果自己改过设置，一切以他改的为准。
 */
export const PRESET = {
  /**
   * 站点地址。2026-10 起改用用户自己部署的 Cloudflare Pages 实例 ——
   * tv.goldm.cc.cd 在他家电视网络下访问不稳定，pages 这个实测更快、更稳。
   * 注意该实例是 **localstorage** 模式：服务端不存数据，登录只校验密码、不需要用户名。
   */
  apiBaseUrl: "https://moontv-97w.pages.dev",
  /** 用户名：localstorage 模式的站点不需要，留空 */
  username: "",
  /** 站点密码（localstorage 模式只要这一个） */
  password: "123456",
};
