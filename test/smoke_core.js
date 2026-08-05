// qqbot-pro core 冒烟测试（在 Operit 沙盒中运行）
const core = require("../shared/core.js");

const exported = Object.keys(core).sort();
let result = { success: true, exported, note: "core.js 加载成功" };

// 1. buildSendBody Markdown 逻辑
try {
    const body = core.buildSendBody({ markdown: "# 标题\n**加粗**", msg_seq: 1 });
    result.markdown = {
        msg_type: body.msg_type,
        hasMarkdown: !!body.markdown,
        contentPrefix: body.markdown && body.markdown.content.slice(0, 10),
        contentCleared: body.content === undefined
    };
    result.markdown_ok = body.msg_type === 2 && !!body.markdown && body.content === undefined;
} catch (e) {
    result.markdown_ok = false;
    result.error_markdown = String(e);
}

// 2. buildSendBody 引用回复
try {
    const body2 = core.buildSendBody({ content: "hi", msg_id: "M1", message_reference: { message_id: "REF1" }, msg_seq: 1 });
    result.reference = body2;
    result.reference_ok = !!body2.message_reference && body2.message_reference.message_id === "REF1";
} catch (e) {
    result.reference_ok = false;
    result.error_reference = String(e);
}

// 3. buildSendBody 输入中状态
try {
    const body3 = core.buildSendBody({ input_notify: { input_type: 1, input_second: 60 }, msg_seq: 1 });
    result.input_notify_ok = body3.msg_type === 6 && !!body3.input_notify;
} catch (e) {
    result.input_notify_ok = false;
    result.error_input = String(e);
}

// 4. 纯文本
try {
    const body4 = core.buildSendBody({ content: "hello", msg_seq: 1 });
    result.text_ok = body4.msg_type === 0 && body4.content === "hello";
} catch (e) {
    result.text_ok = false;
    result.error_text = String(e);
}

result.all_ok = !!(result.markdown_ok && result.reference_ok && result.input_notify_ok && result.text_ok);
complete(result);