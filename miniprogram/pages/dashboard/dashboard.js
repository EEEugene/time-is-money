const app = getApp();

const WORK_MODE_DAYS = {
  double:         21.75,
  alternating:    24,
  single:         26,
  monthEndSingle: 22.75,
};

// ── 工具函数 ──
function pad(n) { return String(n).padStart(2, '0'); }

function parseTime(timeStr) {
  const parts = (timeStr || '09:00').split(':');
  return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) || 0 };
}

function formatTime(date) {
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function formatDate(date) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日 星期' + weekdays[date.getDay()];
}

function formatMoney(amount) {
  const intPart = Math.floor(amount);
  const decPart = Math.floor((amount - intPart) * 100);
  return {
    int: intPart.toLocaleString('zh-CN'),
    dec: '.' + String(decPart).padStart(2, '0'),
  };
}

function formatDuration(ms) {
  if (ms <= 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + '时' + m + '分' + s + '秒';
  if (m > 0) return m + '分' + s + '秒';
  return s + '秒';
}

Page({
  data: {
    theme: 'dark',
    // 时间
    currentTime: '--:--:--',
    currentDate: '----年--月--日',
    countdown: '',
    // 收入
    earnedInt: '0',
    earnedDec: '.00',
    hourlyRateText: '0.00',
    progressPct: 0,
    // 状态
    statusRunning: true,
    statusText: '工作中',
    // 统计
    dailyGoalText: '¥0',
    completionPct: 0,
    // 按钮
    paused: false,
  },

  // ── 内部状态 ──
  config: null,
  hourlyRate: 0,
  secondRate: 0,
  dailyTarget: 0,
  paused: false,
  pauseAccumMs: 0,
  pauseStart: null,
  timerId: null,

  onLoad() {
    // 读取配置
    const saved = wx.getStorageSync('salary_calc_config');
    if (!saved || !saved.monthlySalary) {
      wx.redirectTo({ url: '/pages/setup/setup' });
      return;
    }
    this.config = saved;
    this.calcRates();
    this.paused = false;
    this.pauseAccumMs = 0;
    this.pauseStart = null;
    this.startTicking();
  },

  onShow() {
    // 同步主题
    const theme = app.getTheme();
    if (this.data.theme !== theme) {
      this.setData({ theme });
    }
  },

  onHide() {
    this.stopTicking();
  },

  onUnload() {
    this.stopTicking();
  },

  // ── 计算 ──
  calcRates() {
    const cfg = this.config;
    const wd = cfg.workMode === 'custom' ? cfg.workDays : WORK_MODE_DAYS[cfg.workMode];
    const monthlyHours = wd * cfg.workHours;
    if (monthlyHours <= 0) return;
    const effectiveMonthly = cfg.monthlySalary * cfg.annualMonths / 12;
    this.hourlyRate = effectiveMonthly / monthlyHours;
    this.secondRate = this.hourlyRate / 3600;
    this.dailyTarget = this.hourlyRate * cfg.workHours;
  },

  // ── 时间辅助 ──
  getTodayStart() {
    const { h, m } = parseTime(this.config.startTime);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  },

  getTodayEnd() {
    const { h, m } = parseTime(this.config.startTime);
    const d = new Date();
    d.setHours(h + this.config.workHours, m, 0, 0);
    return d;
  },

  getLunchStart() {
    const { h, m } = parseTime(this.config.lunchStart);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  },

  getLunchEnd() {
    const { h, m } = parseTime(this.config.lunchEnd);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  },

  getWorkedSeconds(now) {
    const todayStart = this.getTodayStart();
    const todayEnd = this.getTodayEnd();
    const lunchStart = this.getLunchStart();
    const lunchEnd = this.getLunchEnd();

    if (now <= todayStart) return 0;

    const effectiveStart = todayStart;
    const effectiveEnd = now > todayEnd ? todayEnd : now;

    if (lunchStart < lunchEnd) {
      if (effectiveEnd > lunchStart) {
        const overlapStart = effectiveStart > lunchStart ? effectiveStart : lunchStart;
        const overlapEnd = effectiveEnd < lunchEnd ? effectiveEnd : lunchEnd;
        if (overlapEnd > overlapStart) {
          const rawMs = effectiveEnd - effectiveStart;
          const lunchMs = overlapEnd - overlapStart;
          return Math.max(0, (rawMs - lunchMs) / 1000);
        }
      }
    }
    return (effectiveEnd - effectiveStart) / 1000;
  },

  // ── Tick ──
  tick() {
    const now = new Date();

    const todayStart = this.getTodayStart();
    const todayEnd = this.getTodayEnd();
    const lunchStart = this.getLunchStart();
    const lunchEnd = this.getLunchEnd();

    let earnedSecs = 0;
    let statusRunning = true;
    let statusText = '工作中';
    let countdownText = '';

    if (now < todayStart) {
      earnedSecs = 0;
      statusRunning = false;
      statusText = '等待上班';
      countdownText = '距离上班 ' + formatDuration(todayStart - now);
    } else if (this.paused) {
      earnedSecs = this.pauseAccumMs / 1000;
      statusRunning = false;
      statusText = '已暂停';
    } else if (now >= todayEnd) {
      earnedSecs = this.getWorkedSeconds(todayEnd);
      statusRunning = false;
      statusText = '已下班';
    } else {
      earnedSecs = this.getWorkedSeconds(now);

      if (now < lunchStart) {
        countdownText = '距离午休 ' + formatDuration(lunchStart - now);
      } else if (now >= lunchStart && now < lunchEnd) {
        statusText = '午休中';
        statusRunning = false;
        countdownText = '午休剩余 ' + formatDuration(lunchEnd - now);
      } else {
        countdownText = '距离下班 ' + formatDuration(todayEnd - now);
      }
    }

    const earned = earnedSecs * this.secondRate;
    const money = formatMoney(earned);

    const lunchSecs = (lunchStart < lunchEnd) ? (lunchEnd - lunchStart) / 1000 : 0;
    const maxSecs = this.config.workHours * 3600 - lunchSecs;
    const progressPct = Math.min(100, maxSecs > 0 ? (earnedSecs / maxSecs) * 100 : 0);

    this.setData({
      currentTime: formatTime(now),
      currentDate: formatDate(now),
      countdown: countdownText,
      earnedInt: money.int,
      earnedDec: money.dec,
      hourlyRateText: this.hourlyRate.toFixed(2),
      progressPct: progressPct.toFixed(1),
      statusRunning: statusRunning,
      statusText: statusText,
      dailyGoalTarget: this.dailyTarget,
      dailyGoalText: '¥' + formatMoney(this.dailyTarget).int,
      completionPct: Math.min(100, Math.floor(progressPct)),
    });
  },

  startTicking() {
    this.stopTicking();
    this.tick();
    this.timerId = setInterval(() => { this.tick(); }, 1000);
  },

  stopTicking() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  // ── 暂停/继续 ──
  onTogglePause() {
    if (this.paused) {
      const pausedDuration = Date.now() - this.pauseStart;
      this.pauseAccumMs += pausedDuration;
      this.pauseStart = null;
      this.paused = false;
      this.setData({ paused: false });
      wx.showToast({ title: '已恢复', icon: 'none', duration: 1500 });
    } else {
      const now = new Date();
      const todayStart = this.getTodayStart();
      if (now < todayStart) return;
      const elapsedMs = now - todayStart;
      this.pauseAccumMs = Math.min(elapsedMs, this.config.workHours * 3600 * 1000);
      this.pauseStart = Date.now();
      this.paused = true;
      this.setData({ paused: true });
      wx.showToast({ title: '已暂停', icon: 'none', duration: 1500 });
    }
  },

  // ── 重新设置 ──
  onReset() {
    wx.showModal({
      title: '确定重新设置？',
      content: '当前进度将丢失',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('salary_calc_config');
          wx.redirectTo({ url: '/pages/setup/setup' });
        }
      },
    });
  },

  // ── 主题切换 ──
  onToggleTheme() {
    const theme = app.toggleTheme();
    this.setData({ theme });
  },
});