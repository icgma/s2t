// s2t — 简繁转换
// 字典随页面本地加载（vendor/opencc-full.min.js），稿件不上传。

(() => {
  "use strict";

  // ---------- 预设方向 ----------
  // twp = 台湾正体 + 常用词汇（软件->軟體）；tw = 仅字形；hk = 香港字形
  const PRESETS = {
    cn2twp: { name: "简 → 繁（台湾）", desc: "转换字形并套用台湾用词习惯，适合发往台湾媒体的稿件。", from: "cn", to: "twp", reverse: "twp2cn" },
    cn2hk:  { name: "简 → 繁（香港）", desc: "转换为香港常用字形，适合发往港媒的稿件。", from: "cn", to: "hk", reverse: "hk2cn" },
    cn2tw:  { name: "简 → 繁（通用字）", desc: "只转换字形，不改动词汇，保留原文用词。", from: "cn", to: "tw", reverse: "tw2cn" },
    twp2cn: { name: "繁（台湾）→ 简", desc: "转为简体并把台湾用词还原为大陆习惯用法。", from: "twp", to: "cn", reverse: "cn2twp" },
    hk2cn:  { name: "繁（香港）→ 简", desc: "香港繁体转简体，适合处理港媒来稿。", from: "hk", to: "cn", reverse: "cn2hk" },
    tw2cn:  { name: "繁 → 简（仅字形）", desc: "只还原字形，保留原文词汇。", from: "tw", to: "cn", reverse: "cn2tw" },
    tw2hk:  { name: "繁（台）→ 繁（港）", desc: "台湾正体转香港字形。", from: "tw", to: "hk", reverse: "hk2tw" },
    hk2tw:  { name: "繁（港）→ 繁（台）", desc: "香港字形转台湾正体。", from: "hk", to: "tw", reverse: "tw2hk" },
    jp2cn:  { name: "日本新字体 → 简", desc: "把日文汉字（新字体）转为简体中文汉字。", from: "jp", to: "cn", reverse: "cn2tw" },
  };

  // 直角引号：中文出版物常用，港台媒体尤其普遍
  const QUOTES_TO_CORNER = [["“", "「"], ["”", "」"], ["‘", "『"], ["’", "』"]];
  const QUOTES_TO_CURLY = [["「", "“"], ["」", "”"], ["『", "‘"], ["』", "’"]];

  const state = { preset: "cn2twp", highlight: true, quotes: false };

  const $ = (s) => document.querySelector(s);
  const els = {
    navItems: document.querySelectorAll(".nav-item"),
    presetName: $("#presetName"),
    presetDesc: $("#presetDesc"),
    input: $("#input"),
    output: $("#output"),
    outputView: $("#outputView"),
    inputCount: $("#inputCount"),
    outputCount: $("#outputCount"),
    status: $("#status"),
    hint: $("#hint"),
    swap: $("#swapBtn"),
    highlight: $("#optHighlight"),
    quotes: $("#optQuotes"),
    themeToggle: $("#themeToggle"),
    themeLabel: $("#themeLabel"),
  };

  // ---------- 主题 ----------
  const THEME_KEY = "toolkit-theme";
  const root = document.documentElement;
  function applyTheme(theme) {
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (els.themeLabel) {
      const isLight = theme === "light" || (theme === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
      els.themeLabel.textContent = isLight ? "深色" : "浅色";
    }
  }
  function cycleTheme() {
    const cur = localStorage.getItem(THEME_KEY) || "auto";
    const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "auto");
  els.themeToggle.addEventListener("click", cycleTheme);

  // ---------- 转换器缓存 ----------
  const cache = new Map();
  function getConverter() {
    const p = PRESETS[state.preset];
    const key = `${p.from}>${p.to}:${state.quotes ? "q" : "-"}`;
    if (cache.has(key)) return cache.get(key);

    const toTraditional = p.to !== "cn";
    const extra = state.quotes ? [toTraditional ? QUOTES_TO_CORNER : QUOTES_TO_CURLY] : [];
    const conv = OpenCC.ConverterFactory(
      OpenCC.Locale.from[p.from],
      OpenCC.Locale.to[p.to],
      extra
    );
    cache.set(key, conv);
    return conv;
  }

  // ---------- 分块：按标点与换行切分 ----------
  // OpenCC 的词组匹配不会跨越标点，按块转换可安全地做逐块 diff。
  function splitChunks(text) {
    return text.split(/([\s，。！？；：、“”‘’「」『』（）()\[\]…—·\-\/]+)/);
  }

  // 短块用 LCS 标出改动位置
  function markDiff(a, b) {
    const A = [...a], B = [...b];
    const n = A.length, m = B.length;
    if (n === 0) return esc(b);
    if (m === 0) return "";
    // 长块跳过精细 diff，整块标记
    if (n * m > 40000) return a === b ? esc(b) : WRAP(esc(b));

    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let out = "", buf = "", i = 0, j = 0;
    const flush = () => { if (buf) { out += WRAP(esc(buf)); buf = ""; } };
    while (i < n && j < m) {
      if (A[i] === B[j]) { flush(); out += esc(B[j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else { buf += B[j]; j++; }
    }
    while (j < m) { buf += B[j]; j++; }
    flush();
    return out;
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const WRAP = (html) => `<mark class="chg">${html}</mark>`;

  // ---------- 主流程 ----------
  let ready = false;
  function run() {
    const text = els.input.value;
    els.inputCount.textContent = count(text);

    if (!ready) return;
    if (text === "") {
      els.output.value = "";
      els.outputView.innerHTML = "";
      els.outputCount.textContent = count("");
      setStatus("ready", "就绪");
      els.hint.textContent = "";
      return;
    }

    try {
      const conv = getConverter();
      const chunks = splitChunks(text);
      let plain = "", html = "", changed = 0;

      for (const chunk of chunks) {
        if (!chunk) continue;
        const out = conv(chunk);
        plain += out;
        if (out === chunk) {
          html += esc(out);
        } else {
          changed++;
          html += state.highlight ? markDiff(chunk, out) : esc(out);
        }
      }

      els.output.value = plain;
      els.outputView.innerHTML = html;
      els.outputCount.textContent = count(plain);
      setStatus(changed ? "ok" : "ready", changed ? "已转换" : "无需改动");
      els.hint.textContent = changed ? `${changed} 处词句有改动` : "原文与目标写法一致";
    } catch (e) {
      setStatus("error", "转换失败");
      els.hint.textContent = e.message || String(e);
    }
  }

  function count(s) {
    const chars = [...s].length;
    const cjk = (s.match(/[一-鿿㐀-䶿]/g) || []).length;
    return `${chars} 字 · ${cjk} 汉字`;
  }

  function setStatus(kind, text) {
    els.status.className = "status " + kind;
    els.status.textContent = text;
  }

  // ---------- 交互 ----------
  function selectPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    state.preset = key;
    els.presetName.textContent = p.name;
    els.presetDesc.textContent = p.desc;
    for (const b of els.navItems) b.classList.toggle("active", b.dataset.preset === key);
    run();
  }

  for (const btn of els.navItems) {
    btn.addEventListener("click", () => selectPreset(btn.dataset.preset));
  }

  els.highlight.addEventListener("change", () => { state.highlight = els.highlight.checked; run(); });
  els.quotes.addEventListener("change", () => { state.quotes = els.quotes.checked; run(); });

  let debounce;
  els.input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 140);
  });

  els.swap.addEventListener("click", () => {
    const rev = PRESETS[state.preset].reverse;
    els.input.value = els.output.value;
    // 侧栏里没有的方向（如 tw2cn）仍可用，只是不高亮任何按钮
    selectPreset(rev);
    els.input.focus();
  });

  const SAMPLE = "记者今天通过网络软件采访了这位程序员，他用鼠标点开硬盘里的视频文件，屏幕上显示着“数据分析”的结果。他说，人工智能的信息处理能力远超预期。";

  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "clear-input") { els.input.value = ""; run(); els.input.focus(); }
    else if (act === "sample") { els.input.value = SAMPLE; run(); }
    else if (act === "paste") {
      navigator.clipboard.readText().then((t) => { els.input.value = t; run(); })
        .catch(() => { setStatus("error", "无法读取剪贴板"); els.hint.textContent = "请手动粘贴（Ctrl+V）"; });
    } else if (act === "copy") {
      const v = els.output.value;
      if (!v) return;
      const btn = e.target.closest("[data-act]");
      navigator.clipboard.writeText(v).then(() => {
        const orig = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => { btn.textContent = orig; }, 900);
      }).catch(() => setStatus("error", "复制失败"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.activeElement === els.input) { els.input.value = ""; run(); }
  });

  // ---------- 启动 ----------
  if (typeof OpenCC === "undefined") {
    setStatus("error", "字典未加载");
    els.hint.textContent = "vendor/opencc-full.min.js 缺失或被拦截";
    return;
  }
  ready = true;
  selectPreset("cn2twp");
  setStatus("ready", "就绪");
})();
