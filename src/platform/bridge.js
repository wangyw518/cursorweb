import { CONFIG } from '../config.js';

const isWechat = typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function';

/**
 * 平台适配层：微信真机走 wx，浏览器走 Web API。
 * 玩法全程不依赖网络，分享种子走 query / query.scene。
 */
export const platform = {
  isWechat,

  getLaunchQuery() {
    if (isWechat && wx.getLaunchOptionsSync) {
      const opt = wx.getLaunchOptionsSync();
      return { ...(opt.query || {}), scene: opt.scene };
    }
    const params = new URLSearchParams(location.search);
    const query = {};
    for (const [k, v] of params.entries()) query[k] = v;
    return query;
  },

  onShow(handler) {
    if (isWechat && wx.onShow) {
      wx.onShow((res) => handler(res.query || {}));
      return;
    }
    window.addEventListener('popstate', () => handler(platform.getLaunchQuery()));
  },

  setShareAppMessage(builder) {
    if (isWechat && wx.showShareMenu && wx.onShareAppMessage) {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
      wx.onShareAppMessage(() => {
        const payload = builder();
        return {
          title: payload.title,
          imageUrl: payload.imageUrl || CONFIG.shareImageUrl,
          query: payload.query,
        };
      });
      if (wx.onShareTimeline) {
        wx.onShareTimeline(() => {
          const payload = builder();
          return {
            title: payload.title,
            imageUrl: payload.imageUrl || CONFIG.shareImageUrl,
            query: payload.query,
          };
        });
      }
      return;
    }
    // Web：暴露给 UI 按钮
    platform._webShareBuilder = builder;
  },

  async share(payload) {
    const data = payload || (platform._webShareBuilder ? platform._webShareBuilder() : null);
    if (!data) return false;

    if (isWechat && wx.shareAppMessage) {
      // 基础库较新才有主动分享；否则引导右上角
      try {
        wx.shareAppMessage({
          title: data.title,
          imageUrl: data.imageUrl || CONFIG.shareImageUrl,
          query: data.query,
        });
        return true;
      } catch {
        platform.toast('请点击右上角 ··· 转发给朋友');
        return false;
      }
    }

    const url = `${location.origin}${location.pathname}?${data.query}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: data.title, text: data.title, url });
        return true;
      } catch {
        /* user cancel */
      }
    }
    try {
      await navigator.clipboard.writeText(`${data.title}\n${url}`);
      platform.toast('挑战链接已复制，快发给同事');
      return true;
    } catch {
      platform.toast(url);
      return false;
    }
  },

  storage: {
    get(key, fallback = null) {
      try {
        if (isWechat && wx.getStorageSync) {
          const v = wx.getStorageSync(key);
          return v === '' || v === undefined ? fallback : v;
        }
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (isWechat && wx.setStorageSync) {
          wx.setStorageSync(key, value);
          return;
        }
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota */
      }
    },
  },

  toast(title) {
    if (isWechat && wx.showToast) {
      wx.showToast({ title, icon: 'none', duration: 2000 });
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = title;
    document.getElementById('app')?.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  },

  vibrate(short = true) {
    try {
      if (isWechat && wx.vibrateShort) {
        wx.vibrateShort({ type: short ? 'light' : 'medium' });
        return;
      }
      if (navigator.vibrate) navigator.vibrate(short ? 15 : 35);
    } catch {
      /* ignore */
    }
  },

  /** 激励视频：无广告位时直接回调成功（开发预览） */
  showRewardedAd() {
    return new Promise((resolve) => {
      if (!CONFIG.rewardAdUnitId) {
        platform.toast('开发模式：已模拟看完广告');
        resolve(true);
        return;
      }
      if (isWechat && wx.createRewardedVideoAd) {
        const ad = wx.createRewardedVideoAd({ adUnitId: CONFIG.rewardAdUnitId });
        const cleanup = () => {
          ad.offClose?.(onClose);
          ad.offError?.(onError);
        };
        const onClose = (res) => {
          cleanup();
          resolve(!!(res && res.isEnded));
        };
        const onError = () => {
          cleanup();
          platform.toast('广告暂时不可用');
          resolve(false);
        };
        ad.onClose(onClose);
        ad.onError(onError);
        ad.load()
          .then(() => ad.show())
          .catch(() => {
            ad.load()
              .then(() => ad.show())
              .catch(onError);
          });
        return;
      }
      platform.toast('开发模式：已模拟看完广告');
      resolve(true);
    });
  },
};
