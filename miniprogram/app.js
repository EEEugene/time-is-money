App({
  globalData: {
    theme: 'dark'  // 'dark' | 'light'
  },

  onLaunch() {
    // 读取保存的主题
    const savedTheme = wx.getStorageSync('salary_calc_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      this.globalData.theme = savedTheme;
    } else {
      // 跟随系统
      const sys = wx.getSystemInfoSync();
      this.globalData.theme = sys.theme || 'dark';
    }
  },

  getTheme() {
    return this.globalData.theme;
  },

  setTheme(theme) {
    this.globalData.theme = theme;
    wx.setStorageSync('salary_calc_theme', theme);
  },

  toggleTheme() {
    const next = this.globalData.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  }
});