import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto("http://localhost:1420", { waitUntil: "networkidle" });

const sel = '.vditor-ir pre[contenteditable="true"]';
await page.waitForSelector(sel, { timeout: 10000 });

const sampleHeadings = await page.$eval(sel, (el) =>
  Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
    (h) => h.tagName + ":" + h.textContent.slice(0, 20)
  )
);

// 把光标移到内容末尾
await page.click(sel);
await page.keyboard.press("Meta+a");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");

// 测试 1：带空格 "# "
await page.keyboard.type("# 带空格标题", { delay: 30 });
await page.waitForTimeout(400);

await page.keyboard.press("Enter");
// 测试 2：不带空格 "#"
await page.keyboard.type("#不带空格标题", { delay: 30 });
await page.waitForTimeout(400);

await page.keyboard.press("Enter");
// 测试 3：二级 "## "
await page.keyboard.type("## 二级带空格", { delay: 30 });
await page.waitForTimeout(500);

const afterHeadings = await page.$eval(sel, (el) =>
  Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
    (h) => h.tagName + ":" + h.textContent.slice(0, 20)
  )
);

const fullText = await page.$eval(sel, (el) => el.textContent);
const tailHtml = await page.$eval(sel, (el) => el.innerHTML.slice(-900));

console.log("=== 初始示例里的标题 ===");
console.log(JSON.stringify(sampleHeadings, null, 0));
console.log("=== 我敲键盘后，编辑区里所有标题元素 ===");
console.log(JSON.stringify(afterHeadings, null, 0));
console.log("=== 编辑区纯文本(看 # 是否还在) ===");
console.log(JSON.stringify(fullText.slice(-120)));
console.log("=== 末尾 HTML 片段 ===");
console.log(tailHtml);
console.log("=== 控制台报错 ===");
console.log(JSON.stringify(errors.slice(0, 10), null, 0));

await browser.close();
