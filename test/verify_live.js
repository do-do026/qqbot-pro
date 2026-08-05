// qqbot-pro 真实链路验证：在 Operit 沙盒宿主中
// 读取环境变量凭证 -> 获取 access token -> 验证连通
async function main() {
    const result = { success: false, steps: {} };

    // Step 1: 读取凭证
    const appId = (typeof getEnv === "function") ? String(getEnv("QQBOT_APP_ID") || "").trim() : "";
    const appSecret = (typeof getEnv === "function") ? String(getEnv("QQBOT_APP_SECRET") || "").trim() : "";
    result.steps.env = { hasAppId: !!appId, hasAppSecret: !!appSecret };
    if (!appId || !appSecret) {
        result.error = "Missing QQBOT_APP_ID / QQBOT_APP_SECRET in env";
        complete(result);
        return;
    }

    // Step 2: 获取 token
    const resp = await Tools.Net.http({
        url: "https://bots.qq.com/app/getAppAccessToken",
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json; charset=utf-8" },
        body: { appId, clientSecret: appSecret },
        connect_timeout: 10,
        read_timeout: 10,
        validateStatus: false
    });
    const statusCode = Number(resp && resp.statusCode == null ? 0 : resp.statusCode);
    const content = String(resp && resp.content || "");
    let json = {};
    try { json = JSON.parse(content); } catch (_) {}
    result.steps.token = { httpStatus: statusCode, hasAccessToken: !!(json.access_token || json.accessToken) };
    if (!json.access_token) {
        result.error = content.slice(0, 300);
        complete(result);
        return;
    }

    // Step 3: 用 token 调 /users/@me 验证 OpenAPI
    const token = json.access_token;
    const me = await Tools.Net.http({
        url: "https://api.sgroup.qq.com/users/@me",
        method: "GET",
        headers: {
            Accept: "application/json",
            Authorization: `QQBot ${token}`,
            "X-Union-Appid": appId
        },
        connect_timeout: 10,
        read_timeout: 10,
        validateStatus: false
    });
    let meJson = {};
    try { meJson = JSON.parse(String(me && me.content || "")); } catch (_) {}
    result.steps.me = {
        httpStatus: Number(me && me.statusCode == null ? 0 : me.statusCode),
        botId: meJson.id || "",
        botName: meJson.username || meJson.nickname || ""
    };
    result.success = !!meJson.id;
    result.note = "链路验证：env -> access token -> OpenAPI /users/@me";
    complete(result);
}

main().catch(e => complete({ success: false, error: String(e && e.message || e) }));