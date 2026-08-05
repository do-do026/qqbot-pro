/*
 * qqbot-pro 共享核心
 * 独立于原包 com.operit.qqbot_bundle，复用其环境变量凭证（QQBOT_APP_ID / QQBOT_APP_SECRET）
 * 不修改原包任何文件。
 */
"use strict";

const PACKAGE_VERSION = "0.1.0";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const API_BASE_URL = "https://api.sgroup.qq.com";
const SANDBOX_API_BASE_URL = "https://sandbox.api.sgroup.qq.com";
const DEFAULT_TIMEOUT_MS = 20000;

function asText(value) {
    return value == null ? "" : String(value);
}

function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstNonBlank() {
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

function safeErrorMessage(error) {
    try {
        if (typeof error === "string") return error;
        if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
        return error == null ? "" : String(error);
    } catch (_) {
        return "Unknown error";
    }
}

function parsePositiveInt(value, fieldName, fallback) {
    const raw = asText(value).trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${fieldName}: expected positive integer`);
    return parsed;
}

function toHttpTimeoutSeconds(timeoutMs) {
    return Math.max(1, Math.ceil(timeoutMs / 1000));
}

function readEnv(key) {
    if (typeof getEnv !== "function") return "";
    const value = getEnv(key);
    return value == null ? "" : asText(value).trim();
}

function getSandbox() {
    // 独立开关：优先新包专用环境变量，其次复用原包无默认false
    const raw = readEnv("QQBOT_PRO_SANDBOX");
    if (raw) return raw === "true" || raw === "1" || raw === "yes";
    return false;
}

function requireConfiguredSnapshot() {
    const appId = readEnv("QQBOT_APP_ID");
    const appSecret = readEnv("QQBOT_APP_SECRET");
    if (!appId) throw new Error("Missing env: QQBOT_APP_ID");
    if (!appSecret) throw new Error("Missing env: QQBOT_APP_SECRET");
    return { appId, appSecret, useSandbox: getSandbox() };
}

async function fetchAccessToken(snapshot, timeoutMs) {
    const result = await requestJson(
        TOKEN_URL,
        "POST",
        { Accept: "application/json", "Content-Type": "application/json; charset=utf-8" },
        { appId: snapshot.appId, clientSecret: snapshot.appSecret },
        timeoutMs
    );
    const accessToken = firstNonBlank(asText(result.json.access_token), asText(result.json.accessToken));
    const message = firstNonBlank(asText(result.json.message), result.success ? "" : `HTTP ${result.statusCode}`);
    if (!result.success || !accessToken) {
        throw new Error(firstNonBlank(message, "Failed to retrieve QQ Bot access token"));
    }
    return {
        accessToken,
        expiresIn: parsePositiveInt(
            firstNonBlank(asText(result.json.expires_in), asText(result.json.expiresIn)),
            "expires_in",
            0
        ),
        tokenType: "QQBot"
    };
}

async function requestJson(url, method, headers, body, timeoutMs) {
    const response = await Tools.Net.http({
        url,
        method,
        headers,
        body: body || undefined,
        connect_timeout: toHttpTimeoutSeconds(timeoutMs),
        read_timeout: toHttpTimeoutSeconds(timeoutMs),
        validateStatus: false
    });
    const statusCode = Number(response && response.statusCode == null ? 0 : response.statusCode);
    const content = asText(response && response.content);
    let json = {};
    try {
        const trimmed = content.trim();
        if (trimmed) {
            const parsed = JSON.parse(trimmed);
            if (isObject(parsed)) json = parsed;
        }
    } catch (_) {}
    return {
        success: statusCode >= 200 && statusCode < 300,
        statusCode,
        contentType: asText(response && response.contentType),
        body: content,
        json
    };
}

async function openApiRequest(snapshot, path, method, body, timeoutMs) {
    const token = await fetchAccessToken(snapshot, timeoutMs);
    const baseUrl = snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL;
    return await requestJson(
        `${baseUrl}${path}`,
        method,
        {
            Accept: "application/json",
            Authorization: `${token.tokenType} ${token.accessToken}`,
            "X-Union-Appid": snapshot.appId,
            ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {})
        },
        body,
        timeoutMs
    );
}

function parseMsgSeq(value) {
    const raw = asText(value).trim();
    if (!raw) return 1;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Invalid msg_seq: expected positive integer");
    return parsed;
}

function resolveTimeoutMs(value) {
    return parsePositiveInt(value, "timeout_ms", DEFAULT_TIMEOUT_MS);
}

function buildSendBody(params) {
    const body = {
        msg_type: params.msg_type == null ? 0 : Number(params.msg_type),
        msg_seq: parseMsgSeq(params.msg_seq)
    };
    const content = asText(params.content).trim();
    if (content) body.content = content;
    const msgId = asText(params.msg_id).trim();
    if (msgId) body.msg_id = msgId;
    const eventId = asText(params.event_id).trim();
    if (eventId) body.event_id = eventId;

    // 引用回复
    if (params.message_reference && params.message_reference.message_id) {
        body.message_reference = { message_id: asText(params.message_reference.message_id).trim() };
    }
    // Markdown
    if (params.markdown && asText(params.markdown).trim()) {
        body.markdown = { content: asText(params.markdown).trim() };
        if (params.msg_type == null || params.msg_type !== 2) {
            // Markdown 要求 msg_type=2 且 content 必须为空
            if (params.msg_type == null) body.msg_type = 2;
            delete body.content;
        }
    }
    // 输入中状态
    if (params.input_notify !== undefined && params.input_notify !== null) {
        body.input_notify = params.input_notify;
        if (params.msg_type == null) body.msg_type = 6;
    }
    return body;
}

module.exports = {
    PACKAGE_VERSION,
    API_BASE_URL,
    SANDBOX_API_BASE_URL,
    DEFAULT_TIMEOUT_MS,
    asText,
    isObject,
    firstNonBlank,
    safeErrorMessage,
    parsePositiveInt,
    buildSendBody,
    requireConfiguredSnapshot,
    fetchAccessToken,
    openApiRequest,
    resolveTimeoutMs
};