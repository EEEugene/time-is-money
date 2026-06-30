const app = getApp();

const WORK_MODE_DAYS = {
  double:         21.75,
  alternating:    24,
  single:         26,
  monthEndSingle: 22.75,
};

const WORK_MODE_OPTIONS = [
  { value: 'double',          label: '双休（周末双休）' },
  { value: 'alternating',     label: '大小周（单双休交替）' },
  { value: 'single',          label: '单休（每周休一天）' },
  { value: 'monthEndSingle',  label: '月末单休（月末休周日）' },
  { value: 'custom',          label: '自定义天数' },
];

const ANNUAL_OPTIONS = [
  { value: 12, label: '12 薪（无年终奖）' },
  { value: 13, label: '13 薪（1个月年终）' },
  { value: 14, label: '14 薪（2个月年终）' },
  { value: 15, label: '15 薪（3个月年终）' },
  { value: 16, label: '16 薪（4个月年终）' },
  { value: -1,  label: '自定义…' },
];

function getAnnualMonthsValue(am) {
  const found = ANNUAL_OPTIONS.find(o => o.value === am);
  if (found) return am;
  // 不在预设中（比如 18、20 等），返回 -1 表示自定义
  return -1;
}

Page({
  data: {
    theme: 'dark',
    monthlySalary: '',
    workMode: 'double',
    workModeLabel: '双休（周末双休）',
    annualMonths: 12,
    annualLabel: '12 薪（无年终奖）',
    showCustomAnnual: false,
    customAnnualMonths: '',
    workDays: '21.75',
    workDaysDisabled: true,
    workHours: '8',
    startTime: '09:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    showPreview: false,
    previewHourly: '--',
    previewDetail: '',
  },

  onLoad() {
    const theme = app.getTheme();
    this.setData({ theme });

    // 读取保存的配置
    const saved = wx.getStorageSync('salary_calc_config');
    if (saved && saved.monthlySalary > 0) {
      this.setData({
        monthlySalary: String(saved.monthlySalary),
        workMode: saved.workMode || 'double',
        annualMonths: saved.annualMonths || 12,
        customAnnualMonths: String(saved.annualMonths || ''),
        workDays: String(saved.workDays || 21.75),
        workDaysDisabled: saved.workMode !== 'custom',
        workHours: String(saved.workHours || 8),
        startTime: saved.startTime || '09:00',
        lunchStart: saved.lunchStart || '12:00',
        lunchEnd: saved.lunchEnd || '13:00',
      });
      this.applyWorkModeLabel();
      this.applyAnnualLabel();
      this.updatePreview();
    } else {
      this.applyWorkModeLabel();
      this.applyAnnualLabel();
    }
  },

  onShow() {
    const theme = app.getTheme();
    if (this.data.theme !== theme) {
      this.setData({ theme });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const update = { [field]: value };
    this.setData(update);
    this.updatePreview();
  },

  // ── 工作制度 picker ──
  onWorkModePicker() {
    const modes = WORK_MODE_OPTIONS.map(o => o.label);
    const currentIdx = WORK_MODE_OPTIONS.findIndex(o => o.value === this.data.workMode);
    wx.showActionSheet({
      itemList: modes,
      success: (res) => {
        const opt = WORK_MODE_OPTIONS[res.tapIndex];
        const isCustom = opt.value === 'custom';
        this.setData({
          workMode: opt.value,
          workModeLabel: opt.label,
          workDaysDisabled: !isCustom,
          workDays: isCustom ? this.data.workDays : String(WORK_MODE_DAYS[opt.value] || ''),
        });
        this.updatePreview();
      },
    });
  },

  applyWorkModeLabel() {
    const found = WORK_MODE_OPTIONS.find(o => o.value === this.data.workMode);
    if (found) {
      this.setData({ workModeLabel: found.label });
    }
  },

  // ── 年终奖 picker ──
  onAnnualPicker() {
    const items = ANNUAL_OPTIONS.map(o => o.label);
    const am = this.data.annualMonths;
    const currentIdx = ANNUAL_OPTIONS.findIndex(o => o.value === am);
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const opt = ANNUAL_OPTIONS[res.tapIndex];
        if (opt.value === -1) {
          this.setData({
            annualMonths: -1,
            annualLabel: opt.label,
            showCustomAnnual: true,
          });
        } else {
          this.setData({
            annualMonths: opt.value,
            annualLabel: opt.label,
            showCustomAnnual: false,
          });
        }
        this.updatePreview();
      },
    });
  },

  applyAnnualLabel() {
    const val = getAnnualMonthsValue(this.data.annualMonths);
    if (val === -1) {
      this.setData({ showCustomAnnual: true });
      const label = this.data.customAnnualMonths
        ? (parseFloat(this.data.customAnnualMonths) + ' 薪（自定义）')
        : '自定义…';
      this.setData({ annualLabel: label });
    } else {
      this.setData({ showCustomAnnual: false });
      const found = ANNUAL_OPTIONS.find(o => o.value === val);
      if (found) this.setData({ annualLabel: found.label });
    }
  },

  // ── 时间 picker ──
  onTimePicker(e) {
    const field = e.currentTarget.dataset.field;
    const currentVal = this.data[field] || '09:00';
    wx.showToast({ title: '请在下方选择时间', icon: 'none', duration: 1500 });

    // 小程序没有原生的时间字符串选择器，用 picker-view 比较复杂
    // 这里用一个简单方案：弹出输入框让用户输入 HH:MM
    // 更好的做法是用一个自定义组件，但为了简洁这里直接用输入方式
    wx.showModal({
      title: '输入时间',
      editable: true,
      placeholderText: '格式 HH:MM，例如 09:00',
      content: currentVal,
      success: (res) => {
        if (res.confirm && res.content) {
          const val = res.content.trim();
          if (/^\d{1,2}:\d{2}$/.test(val)) {
            const parts = val.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              const newVal = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
              this.setData({ [field]: newVal });
              this.updatePreview();
              return;
            }
          }
          wx.showToast({ title: '格式错误，请输入如 09:00', icon: 'none' });
        }
      },
    });
  },

  // ── 预览 ──
  updatePreview() {
    const ms = parseFloat(this.data.monthlySalary) || 0;
    const wm = this.data.workMode;
    const wd = wm === 'custom' ? (parseFloat(this.data.workDays) || 0) : (WORK_MODE_DAYS[wm] || 0);
    const wh = parseFloat(this.data.workHours) || 8;

    let am = this.data.annualMonths;
    if (am === -1) {
      am = parseFloat(this.data.customAnnualMonths) || 12;
    }

    if (ms > 0 && wd > 0 && wh > 0) {
      const effectiveMonthly = ms * am / 12;
      const hr = effectiveMonthly / (wd * wh);
      const annualSalary = ms * am;
      this.setData({
        showPreview: true,
        previewHourly: hr.toFixed(2),
        previewDetail: '年薪 ' + annualSalary.toLocaleString('zh-CN') + ' 元（' + am + ' 薪 × ¥' + ms.toLocaleString('zh-CN') + '）',
      });
    } else {
      this.setData({ showPreview: false });
    }
  },

  // ── 开始计算 ──
  onStart() {
    const ms = parseFloat(this.data.monthlySalary) || 0;
    const wm = this.data.workMode;
    const wd = wm === 'custom' ? (parseFloat(this.data.workDays) || 0) : (WORK_MODE_DAYS[wm] || 0);
    const wh = parseFloat(this.data.workHours) || 8;
    const st = this.data.startTime || '09:00';
    const ls = this.data.lunchStart || '12:00';
    const le = this.data.lunchEnd || '13:00';

    let am = this.data.annualMonths;
    if (am === -1) {
      am = parseFloat(this.data.customAnnualMonths) || 12;
    }

    if (ms <= 0) { wx.showToast({ title: '请输入月薪', icon: 'none' }); return; }
    if (am < 12) { wx.showToast({ title: '年薪月数不能小于 12', icon: 'none' }); return; }
    if (wd <= 0) { wx.showToast({ title: '请输入工作天数', icon: 'none' }); return; }
    if (wh <= 0) { wx.showToast({ title: '请输入工作小时', icon: 'none' }); return; }

    const config = {
      monthlySalary: ms,
      annualMonths: am,
      workMode: wm,
      workDays: wd,
      workHours: wh,
      startTime: st,
      lunchStart: ls,
      lunchEnd: le,
    };

    wx.setStorageSync('salary_calc_config', config);
    wx.redirectTo({ url: '/pages/dashboard/dashboard' });
  },
});