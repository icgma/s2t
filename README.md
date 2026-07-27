# s2t · 简繁转换

纯前端的简繁中文转换工具，部署在 GitHub Pages，转换全部在浏览器本地完成，稿件不上传。

## 功能

- **简 → 繁**：台湾正体（含用词）、香港字形、通用字形（仅换字不换词）
- **繁 → 简**：台湾用词还原、香港来稿转简
- **繁繁互转**：台湾 ↔ 香港字形
- **日本新字体 → 简**
- 标出每一处改动（逐字 diff）
- 可选直角引号「」转换

## 字典

简繁转换依赖 [OpenCC](https://github.com/BYVoid/OpenCC) 的 JavaScript 版本 [opencc-js](https://github.com/nk2028/opencc-js)，已下载到 `vendor/opencc-full.min.js` 随页面本地加载，不走 CDN。

## 本地预览

直接用浏览器打开 `index.html`，或：

```bash
python -m http.server 8000
```

## 部署

推送到 `main` 分支，`.github/workflows/deploy.yml` 自动发布到 GitHub Pages。
