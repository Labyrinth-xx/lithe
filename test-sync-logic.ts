import { decideExternalChange } from "./src/sync-logic.ts";

let pass = 0;
let fail = 0;
function check(name: string, got: string, want: string) {
  if (got === want) {
    pass++;
    console.log(`  ✅ ${name} → ${got}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} → 得到 ${got}，期望 ${want}`);
  }
}

console.log("外部变动决策测试：");

// 关键：你遇到的 bug 场景 —— 边打字边自动存盘
// 打了第一个"/"，自动存盘写入"/"(lastWritten="/")，又打第二个"/"使编辑器变"//"(dirty)，
// 此时轮询读到磁盘还是"/"。修复后应判为"自存回声→忽略"，不再重灌导致光标乱跳。
check(
  "边打边存的回声(原 bug)",
  decideExternalChange({ diskContent: "/", editorContent: "//", lastWrittenContent: "/", dirty: true }),
  "ignore"
);

// 自存回声：磁盘=自己刚写的，无论编辑器/ dirty 如何都忽略
check(
  "纯自存回声",
  decideExternalChange({ diskContent: "ab", editorContent: "ab", lastWrittenContent: "ab", dirty: false }),
  "ignore"
);

// 已同步：磁盘==编辑器
check(
  "磁盘与编辑器一致",
  decideExternalChange({ diskContent: "x", editorContent: "x", lastWrittenContent: null, dirty: false }),
  "ignore"
);

// 真·外部改动，编辑器无未保存 → 刷新
check(
  "外部改动且无未保存改动",
  decideExternalChange({ diskContent: "新内容", editorContent: "旧内容", lastWrittenContent: "旧内容", dirty: false }),
  "reload"
);

// 真·外部改动，编辑器有未保存改动 → 冲突让用户裁决
check(
  "外部改动且有未保存改动",
  decideExternalChange({ diskContent: "CC版", editorContent: "我编辑的", lastWrittenContent: "基线", dirty: true }),
  "conflict"
);

// 从没写过(lastWritten=null)，磁盘与编辑器不同，无未保存 → 刷新
check(
  "首次外部改动(lastWritten=null)",
  decideExternalChange({ diskContent: "外部", editorContent: "初始", lastWrittenContent: null, dirty: false }),
  "reload"
);

console.log(`\n结果：${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
