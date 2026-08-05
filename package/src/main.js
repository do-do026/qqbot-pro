/*
 * qqbot-pro 主入口
 * 在 Operit 原包 com.operit.qqbot_bundle 基础上增强，独立安装、不修改原包。
 * 工具由 manifest 的 subpackages 机制自动加载（dist/packages/*.js 的 METADATA 块）。
 */
"use strict";

function logStartup(message) {
    console.log(`[qqbot-pro] ${message}`);
}

function registerToolPkg() {
    logStartup("registerToolPkg start");

    // 目前为纯工具包，无 UI 模块、无生命周期钩子（后续里程碑可加）
    // 事件放开（T05）与官方流式（W1）等需要 Gateway 的，放后续子包

    logStartup("registerToolPkg done");
    return true;
}

module.exports = {
    registerToolPkg
};