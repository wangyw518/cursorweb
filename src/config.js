/**
 * 运行时配置：浏览器预览可全用默认值。
 * 上线微信时在 .env 填写，见 .env.example 与 README。
 */
export const CONFIG = {
  appName: import.meta.env.VITE_APP_NAME || '摸鱼判官',
  wechatAppId: import.meta.env.VITE_WECHAT_APP_ID || '',
  rewardAdUnitId: import.meta.env.VITE_REWARD_AD_UNIT_ID || '',
  shareImageUrl: import.meta.env.VITE_SHARE_IMAGE_URL || '/share-cover.png',
  cloudEnvId: import.meta.env.VITE_CLOUD_ENV_ID || '',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  /** 前 N 局不弹广告，保护传播链路 */
  adFreeRuns: 3,
  /** 本地存储键 */
  storageKeys: {
    runs: 'moyu_runs',
    best: 'moyu_best',
    groupBoard: 'moyu_group_board',
  },
};
