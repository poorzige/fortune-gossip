# 八卦命盘 · 纯静态版

这是本项目的 **纯前端构建**，由 GitHub Pages 直接托管：没有服务器、没有构建步骤，
打开就是一个完整可用的六爻 / 梅花占卜站点。

- 排盘、装卦、规则断卦全部在浏览器里完成（引擎由 `backend/core/*.py` 逐行移植，并与
  Python 版做过 4897 例差分对比，输出逐字节一致）
- 占卜记录存在浏览器 `localStorage`，换设备不会同步
- AI 解卦由浏览器直连你填写的 OpenAI 兼容接口，Key 只留在本机；能否连通取决于服务商
  是否允许跨域（DeepSeek、Kimi 可以）

## 目录

```
index.html            页面
css/style.css         样式
js/app.js             交互与渲染
js/local-api.js       静态版"后端"：路由、历史、AI 直连
js/engine/            排盘引擎（历法/卦象/六爻/梅花/断卦）
js/vendor/lunar.js    历法库 lunar-javascript（MIT）
data/hexagram_texts.json  六十四卦卦爻辞
```

需要 Flask 后端版本（本地模型、服务端历史）请看 `main` 分支。
