/**
 * 出厂预置值 —— 给不懂技术的用户免去遥控器输入长地址的痛苦。
 *
 * 电视端输入 https://tv.goldm.cc.cd 这种地址极其难打，所以这里把站点地址和
 * 登录凭据内建，首次启动自动登录；用户如果自己改过设置，一切以他改的为准。
 */
export const PRESET = {
  /** 站点地址（留空则保持原行为：需要用户自己在设置里填） */
  apiBaseUrl: "https://tv.goldm.cc.cd",
  /** 首次启动自动登录用的账号 */
  username: "goldm",
  password: "123456",
};
