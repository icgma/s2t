// s2t 测试 —— 用 node 直接跑：node test.js
// 覆盖：分块转换的一致性、diff 标注、HTML 转义、引号替换、各方向正确性

const path = require("path");
const OpenCC = require(path.join(__dirname, "vendor", "opencc-full.min.js"));

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n  got : ${got}\n  want: ${want}`);
}
function ok(name, cond, note = "") {
  if (cond) { pass++; return; }
  fail++;
  console.log(`FAIL ${name} ${note}`);
}

// ---------- 被测逻辑（与 app.js 保持一致） ----------
const QUOTES_TO_CORNER = [["“", "「"], ["”", "」"], ["‘", "『"], ["’", "』"]];

function splitChunks(text) {
  return text.split(/([\s，。！？；：、“”‘’「」『』（）()\[\]…—·\-\/]+)/);
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const WRAP = (html) => `<mark class="chg">${html}</mark>`;

function markDiff(a, b) {
  const A = [...a], B = [...b];
  const n = A.length, m = B.length;
  if (n === 0) return esc(b);
  if (m === 0) return "";
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

function convertChunked(text, conv) {
  let plain = "";
  for (const chunk of splitChunks(text)) {
    if (!chunk) continue;
    plain += conv(chunk);
  }
  return plain;
}

// ---------- 1. 各方向基本正确性 ----------
const cn2twp = OpenCC.Converter({ from: "cn", to: "twp" });
const cn2tw = OpenCC.Converter({ from: "cn", to: "tw" });
const cn2hk = OpenCC.Converter({ from: "cn", to: "hk" });
const twp2cn = OpenCC.Converter({ from: "twp", to: "cn" });
const tw2cn = OpenCC.Converter({ from: "tw", to: "cn" });
const jp2cn = OpenCC.Converter({ from: "jp", to: "cn" });

eq("cn->twp 用词", cn2twp("软件网络信息"), "軟體網路資訊");
eq("cn->tw 仅字形", cn2tw("软件网络信息"), "軟件網絡信息");
eq("cn->hk 字形", cn2hk("软件网络信息"), "軟件網絡信息");
eq("twp->cn 还原用词", twp2cn("軟體網路資訊"), "软件网络信息");
eq("tw->cn 仅字形", tw2cn("軟體網路資訊"), "软体网路资讯");
eq("jp->cn", jp2cn("簡体中文"), "简体中文");
eq("空串", cn2twp(""), "");
eq("纯 ASCII 不变", cn2twp("hello world 123"), "hello world 123");
eq("已是繁体不变", cn2tw("繁體"), "繁體");

// ---------- 2. 分块转换必须等价于整段转换 ----------
// 这是 s2t 的核心正确性：按标点切块做 diff，不能破坏 OpenCC 的词组匹配
const SAMPLES = [
  "记者今天通过网络软件采访了这位程序员。",
  "他用鼠标点开硬盘里的视频文件，屏幕上显示着“数据分析”的结果。",
  "人工智能的信息处理能力远超预期；这台计算机的内存不够了。",
  "第一段文字。\n\n第二段文字，含换行。\n第三行。",
  "混合 English 和中文的软件 test 网络。",
  "标点密集：（一）、（二）；【三】…四—五·六/七",
  "只有标点。。。，，，！！！",
  "单个字：软",
  "很长的一段" + "软件网络信息".repeat(50) + "结束",
];
for (const [i, s] of SAMPLES.entries()) {
  eq(`分块等价 cn->twp #${i}`, convertChunked(s, cn2twp), cn2twp(s));
  eq(`分块等价 twp->cn #${i}`, convertChunked(cn2twp(s), twp2cn), twp2cn(cn2twp(s)));
}

// ---------- 3. diff 标注 ----------
eq("diff 无变化", markDiff("繁體", "繁體"), "繁體");
ok("diff 有变化被包裹", markDiff("软件", "軟體").includes('<mark class="chg">'), markDiff("软件", "軟體"));
eq("diff 空输入", markDiff("", "abc"), "abc");
eq("diff 空输出", markDiff("abc", ""), "");
ok("diff 保留未改动字符", markDiff("的软件", "的軟體").startsWith("的"), markDiff("的软件", "的軟體"));

// diff 结果去掉标记后必须等于目标文本——否则会丢字或多字
function stripMarks(html) {
  return html.replace(/<\/?mark[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
for (const [i, s] of SAMPLES.entries()) {
  const out = cn2twp(s);
  eq(`diff 不丢字 #${i}`, stripMarks(markDiff(s, out)), out);
}

// 长文本走整块标记分支，同样不能丢字
const longA = "软件".repeat(300);
const longB = cn2twp(longA);
eq("diff 长文本不丢字", stripMarks(markDiff(longA, longB)), longB);

// ---------- 4. HTML 转义（防注入） ----------
eq("转义尖括号", esc("<script>"), "&lt;script&gt;");
eq("转义 &", esc("a&b"), "a&amp;b");
ok("含标签的输入被转义", !markDiff("软件<script>", cn2twp("软件<script>")).includes("<script>"),
  markDiff("软件<script>", cn2twp("软件<script>")));

// ---------- 5. 直角引号 ----------
const cn2twpQ = OpenCC.ConverterFactory(
  OpenCC.Locale.from.cn, OpenCC.Locale.to.twp, [QUOTES_TO_CORNER]
);
eq("直角引号替换", cn2twpQ("他说“数据分析”很重要"), "他說「資料分析」很重要");
eq("不开引号时保留弯引号", cn2twp("他说“数据”"), "他說“資料”");

// ---------- 6. 往返转换 ----------
// 简->繁->简 对常用词应当回到原文（生僻字可能有歧义，只测常用词）
for (const w of ["软件", "网络", "信息", "计算机", "数据", "记者", "采访"]) {
  eq(`往返 ${w}`, twp2cn(cn2twp(w)), w);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
