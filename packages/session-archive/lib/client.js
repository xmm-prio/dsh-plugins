window.__ModuleLoader__.load({ id: "@dsh-plugins/session-archive", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/panel/ArchivePanel.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react3 = require("react");

// src/domain/archive-view.ts
function entryLabel(entry) {
  return entry.title ?? entry.id;
}
function activityOf(entry) {
  return entry.lastActivityAt ?? entry.createdAt;
}
function buildArchiveView(entries, query) {
  const needle = query.trim().toLocaleLowerCase();
  const matched = needle.length === 0 ? entries : entries.filter((entry) => entryLabel(entry).toLocaleLowerCase().includes(needle));
  const buckets = /* @__PURE__ */ new Map();
  for (const entry of matched) {
    const key = entry.workspaceId ?? "";
    const bucket = buckets.get(key);
    if (bucket === void 0) buckets.set(key, [entry]);
    else bucket.push(entry);
  }
  const groups = [...buckets].map(([key, members]) => {
    const sorted = [...members].sort((left, right) => activityOf(right) - activityOf(left));
    return {
      workspaceId: key === "" ? void 0 : key,
      title: key === "" ? void 0 : sorted[0].workspaceTitle,
      entries: sorted,
      sizeBytes: sorted.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0)
    };
  });
  groups.sort((left, right) => {
    if (left.workspaceId === void 0 !== (right.workspaceId === void 0)) {
      return left.workspaceId === void 0 ? 1 : -1;
    }
    return activityOf(right.entries[0]) - activityOf(left.entries[0]);
  });
  return { groups, hidden: entries.length - matched.length };
}

// src/client/text.ts
var text = {
  /** Sidebar footer entry and the panel it opens. */
  entryLabel: "\u5F52\u6863\u533A",
  panelTitle: "\u5F52\u6863\u533A",
  panelDescription: "\u5DF2\u5F52\u6863\u7684\u4F1A\u8BDD\u4E0D\u5728\u4FA7\u680F\u663E\u793A\u3002\u53D6\u6D88\u5F52\u6863\u5373\u53EF\u8BA9\u5B83\u91CD\u65B0\u51FA\u73B0\uFF0C\u5220\u9664\u4F1A\u6C38\u4E45\u79FB\u9664\u5B83\u7684\u65E5\u5FD7\u3002",
  close: "\u5173\u95ED",
  /** Row-level chrome. A session with no resolvable title falls back to its id. */
  untitledWorkspace: "\u672A\u547D\u540D\u5DE5\u4F5C\u533A",
  ungrouped: "\u672A\u5206\u7EC4",
  workspaceColumn: "\u539F\u5DE5\u4F5C\u533A",
  createdAt: "\u521B\u5EFA\u4E8E",
  lastActivityAt: "\u6700\u8FD1\u6D3B\u52A8",
  size: "\u65E5\u5FD7\u5927\u5C0F",
  unknownSize: "\u672A\u77E5",
  /** Title search. */
  searchPlaceholder: "\u6309\u6807\u9898\u641C\u7D22",
  noMatch: "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD\u3002",
  /** Actions. */
  unarchive: "\u53D6\u6D88\u5F52\u6863",
  deleteAction: "\u5220\u9664",
  selectAll: "\u5168\u9009",
  clearSelection: "\u53D6\u6D88\u9009\u62E9",
  refresh: "\u5237\u65B0",
  shutdownAll: "\u5173\u95ED\u6240\u6709\u8FD0\u884C\u4E2D\u4F1A\u8BDD",
  archiving: "\u6B63\u5728\u5F52\u6863\u2026",
  /** Empty, loading, and failure states. */
  loading: "\u6B63\u5728\u8BFB\u53D6\u5F52\u6863\u533A\u2026",
  empty: "\u5F52\u6863\u533A\u662F\u7A7A\u7684\u3002",
  loadFailed: "\u8BFB\u53D6\u5F52\u6863\u533A\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  /** Delete confirmation. */
  deleteTitle: "\u5220\u9664\u4F1A\u8BDD\u65E5\u5FD7",
  deleteAcknowledge: "\u6211\u660E\u767D\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\u3002",
  deleteConfirm: "\u6C38\u4E45\u5220\u9664",
  deleteCancel: "\u53D6\u6D88",
  /** Diagnostics line at the bottom of the panel. */
  backend: "\u6301\u4E45\u5316\u540E\u7AEF",
  degradedMetadata: "\u6295\u5F71\u7F13\u5B58\u4E0D\u53EF\u7528\uFF0C\u6807\u9898\u4E0E\u6D3B\u52A8\u65F6\u95F4\u53EF\u80FD\u7F3A\u5931\u3002",
  unresolvedNotice: "\u4E2A\u5F52\u6863\u4F1A\u8BDD\u5728\u6301\u4E45\u5316\u540E\u7AEF\u4E2D\u5DF2\u4E0D\u5B58\u5728\u3002",
  /** Summaries. */
  selectedCount: (n) => `\u5DF2\u9009\u62E9 ${String(n)} \u4E2A`,
  totalSize: (size) => `\u5171 ${size}`,
  hiddenBySearch: (n) => `${String(n)} \u4E2A\u672A\u5339\u914D\u5DF2\u9690\u85CF`,
  groupSummary: (n, size) => `${String(n)} \u4E2A\u4F1A\u8BDD \xB7 ${size}`,
  archivedCount: (n) => `\u5DF2\u5F52\u6863 ${String(n)} \u4E2A\u4F1A\u8BDD`,
  unarchivedCount: (n) => `\u5DF2\u53D6\u6D88\u5F52\u6863 ${String(n)} \u4E2A\u4F1A\u8BDD`,
  deletedCount: (n) => `\u5DF2\u5220\u9664 ${String(n)} \u4E2A\u4F1A\u8BDD\u7684\u65E5\u5FD7`,
  skippedCount: (n) => `\u8DF3\u8FC7 ${String(n)} \u4E2A`,
  shutdownCount: (n) => `\u5DF2\u5173\u95ED ${String(n)} \u4E2A\u8FD0\u884C\u4E2D\u4F1A\u8BDD`,
  nothingToArchive: "\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u5F52\u6863\u7684\u4F1A\u8BDD\u3002",
  nothingRunning: "\u5F53\u524D\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4F1A\u8BDD\u3002",
  unknownWorkspace: "\u8BE5\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5B58\u5728\u3002",
  partialFailure: (n) => `${String(n)} \u4E2A\u64CD\u4F5C\u672A\u6210\u529F`
};
function deleteDescription(count) {
  return `\u5373\u5C06\u6C38\u4E45\u5220\u9664 ${String(count)} \u4E2A\u4F1A\u8BDD\u7684\u65E5\u5FD7\u6587\u4EF6\u3002\u8FD9\u4E9B\u4F1A\u8BDD\u4F1A\u5148\u88AB\u505C\u6B62\uFF0C\u968F\u540E\u4ECE\u5F52\u6863\u533A\u548C\u539F\u5DE5\u4F5C\u533A\u4E00\u5E76\u79FB\u9664\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`;
}
function rowName(group) {
  if (group.workspaceId === void 0) return text.ungrouped;
  return group.label.length > 0 ? group.label : text.untitledWorkspace;
}
var rowCopy = {
  action: (group) => `\u5F52\u6863\u300C${rowName(group)}\u300D\u4E2D\u7684 ${String(group.sessionCount)} \u4E2A\u4F1A\u8BDD`,
  empty: (group) => `\u300C${rowName(group)}\u300D\u6CA1\u6709\u53EF\u5F52\u6863\u7684\u4F1A\u8BDD`,
  busy: text.archiving
};
function bulkArchiveSummary(result) {
  if (result.refusal !== void 0) return refusalText(result.refusal.code);
  if (result.archived.length === 0 && result.failed.length === 0) return text.nothingToArchive;
  const reasons = [...new Set(result.skipped.map((skip) => skipText(skip.reason)))].join("\u3001");
  return [
    text.archivedCount(result.archived.length),
    ...result.skipped.length > 0 ? [`${text.skippedCount(result.skipped.length)}\uFF08${reasons}\uFF09`] : [],
    ...result.failed.map((outcome) => `${outcome.id}: ${failureText(outcome.code)}`)
  ].join("\uFF1B");
}
var FAILURE_TEXT = {
  "capability-disabled": "\u8BE5\u80FD\u529B\u5728\u5F53\u524D DSH \u7248\u672C\u4E0A\u4E0D\u53EF\u7528",
  "invalid-session-id": "\u4F1A\u8BDD id \u4E0D\u5408\u6CD5",
  "not-archived": "\u4F1A\u8BDD\u4E0D\u5728\u5F52\u6863\u96C6\u5408\u4E2D",
  "archive-set-unreadable": "\u65E0\u6CD5\u8BFB\u53D6\u5F52\u6863\u96C6\u5408\uFF0C\u5DF2\u653E\u5F03\u5199\u5165",
  "unknown-session": "\u5BBF\u4E3B\u627E\u4E0D\u5230\u8FD9\u4E2A\u4F1A\u8BDD",
  "teardown-effect-missing": "\u65E0\u6CD5\u786E\u8BA4\u4F1A\u8BDD\u5DF2\u505C\u6B62\uFF0C\u5DF2\u653E\u5F03\u64CD\u4F5C",
  "write-lease-held": "\u4F1A\u8BDD\u7684\u5199\u53E5\u67C4\u4ECD\u88AB\u5360\u7528",
  "log-root-unknown": "\u65E0\u6CD5\u786E\u5B9A\u4F1A\u8BDD\u65E5\u5FD7\u6839\u76EE\u5F55\uFF0C\u65E7\u683C\u5F0F\u65E5\u5FD7\u65E0\u6CD5\u5B9A\u4F4D",
  "legacy-log-not-found": "\u540E\u7AEF\u4E0D\u63D0\u4F9B\u8BE5\u4F1A\u8BDD\u7684\u65E5\u5FD7\u8DEF\u5F84\uFF0C\u65E5\u5FD7\u6839\u76EE\u5F55\u4E0B\u4E5F\u6CA1\u6709\u5BF9\u5E94\u76EE\u5F55",
  "log-path-refused": "\u65E5\u5FD7\u8DEF\u5F84\u672A\u901A\u8FC7\u5B89\u5168\u6821\u9A8C",
  "ownership-basename-mismatch": "\u63A8\u5BFC\u51FA\u7684\u76EE\u5F55\u540D\u4E0E\u4F1A\u8BDD id \u4E0D\u4E00\u81F4\uFF0C\u5DF2\u653E\u5F03\u5220\u9664",
  "ownership-generation-missing": "\u63A8\u5BFC\u51FA\u7684\u76EE\u5F55\u91CC\u6CA1\u6709\u4F1A\u8BDD\u65E5\u5FD7\u6587\u4EF6\uFF0C\u5DF2\u653E\u5F03\u5220\u9664",
  "ownership-outside-root": "\u63A8\u5BFC\u51FA\u7684\u76EE\u5F55\u4E0D\u5728\u4F1A\u8BDD\u65E5\u5FD7\u6839\u76EE\u5F55\u4E4B\u5185\uFF0C\u5DF2\u653E\u5F03\u5220\u9664",
  "ownership-unsafe-root": "\u63A8\u5BFC\u51FA\u7684\u76EE\u5F55\u5F62\u72B6\u4E0D\u5B89\u5168\uFF0C\u5DF2\u653E\u5F03\u5220\u9664",
  "remove-failed": "\u5220\u9664\u6587\u4EF6\u5931\u8D25",
  "ledger-detach-failed": "\u65E5\u5FD7\u5DF2\u5220\u9664\uFF0C\u4F46\u4F1A\u8BDD\u672A\u80FD\u4ECE\u539F\u5DE5\u4F5C\u533A\u79FB\u9664\uFF1B\u5B83\u4ECD\u7559\u5728\u5F52\u6863\u533A\uFF0C\u53EF\u91CD\u8BD5\u5220\u9664",
  "archive-set-stale": "\u65E5\u5FD7\u5DF2\u5220\u9664\u3001\u4F1A\u8BDD\u4E5F\u5DF2\u8131\u79BB\u5DE5\u4F5C\u533A\uFF0C\u4F46\u5F52\u6863\u533A\u672A\u66F4\u65B0\uFF1B\u5237\u65B0\u540E\u91CD\u8BD5\u5220\u9664",
  "host-error": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u672A\u9884\u671F\u7684\u9519\u8BEF"
};
function failureText(code) {
  return FAILURE_TEXT[code] ?? code;
}
var TRANSPORT_TEXT = {
  "session-archive/bad-request": "\u8BF7\u6C42\u4E0D\u88AB\u5BBF\u4E3B\u63A5\u53D7",
  "session-archive/handler-failed": "\u5BBF\u4E3B\u5904\u7406\u8BF7\u6C42\u65F6\u51FA\u9519",
  "session-archive/no-connection": "\u5F53\u524D profile \u6CA1\u6709\u52A0\u8F7D\u8FDE\u63A5\u670D\u52A1",
  "session-archive/transport": "\u4E0E\u5BBF\u4E3B\u901A\u4FE1\u5931\u8D25"
};
function callFailureText(outcome) {
  const reason = TRANSPORT_TEXT[outcome.code] ?? outcome.code;
  return outcome.message.length > 0 ? `${reason}\uFF08${outcome.message}\uFF09` : reason;
}
var REFUSAL_TEXT = {
  "capability-disabled": "\u5F52\u6863\u80FD\u529B\u5728\u5F53\u524D DSH \u7248\u672C\u4E0A\u4E0D\u53EF\u7528",
  "unknown-scope": text.unknownWorkspace
};
function refusalText(code) {
  return REFUSAL_TEXT[code] ?? code;
}
var BLOCK_TEXT = {
  "workspace-registry-unavailable": "\u5DE5\u4F5C\u533A\u6CE8\u518C\u8868\u4E0D\u53EF\u7528",
  "archive-api-missing": "\u5BBF\u4E3B\u7684\u5F52\u6863\u63A5\u53E3\u5DF2\u6539\u53D8",
  "private-write-path-missing": "\u5BBF\u4E3B\u7684\u5F52\u6863\u96C6\u5408\u5199\u5165\u901A\u8DEF\u5DF2\u6539\u53D8",
  "workspace-domain-unavailable": "\u5DE5\u4F5C\u533A\u5B58\u50A8\u57DF\u672A\u6253\u5F00",
  "fiber-scan-unavailable": "\u65E0\u6CD5\u904D\u5386 Cordis \u7684\u63D2\u4EF6\u6811",
  "persistence-backend-unsupported": "\u5F53\u524D\u6301\u4E45\u5316\u540E\u7AEF\u4E0D\u652F\u6301\u5220\u9664",
  "log-resolver-missing": "\u540E\u7AEF\u4E0D\u518D\u63D0\u4F9B\u65E5\u5FD7\u8DEF\u5F84",
  "log-root-unknown": "\u65E0\u6CD5\u786E\u5B9A\u4F1A\u8BDD\u65E5\u5FD7\u6839\u76EE\u5F55",
  "projection-cache-unavailable": "\u4F1A\u8BDD\u6295\u5F71\u7F13\u5B58\u4E0D\u53EF\u7528",
  "session-list-unavailable": "\u65E0\u6CD5\u8BFB\u53D6\u4F1A\u8BDD\u5217\u8868",
  "probe-failed": "\u80FD\u529B\u63A2\u6D4B\u672C\u8EAB\u5931\u8D25"
};
function blockText(code) {
  return BLOCK_TEXT[code] ?? code;
}
var SKIP_TEXT = {
  subagent: "\u5B50\u4EE3\u7406\u4F1A\u8BDD\u672C\u5C31\u4E0D\u5728\u4FA7\u680F\u663E\u793A",
  "already-archived": "\u5DF2\u7ECF\u5F52\u6863",
  blank: "\u7A7A\u4F1A\u8BDD\u4E0D\u5F52\u6863"
};
function skipText(reason) {
  return SKIP_TEXT[reason] ?? reason;
}
var RELATIVE_UNIT = {
  now: () => "\u521A\u521A",
  minutes: (n) => `${String(n)} \u5206\u949F\u524D`,
  hours: (n) => `${String(n)} \u5C0F\u65F6\u524D`,
  days: (n) => `${String(n)} \u5929\u524D`,
  months: (n) => `${String(n)} \u4E2A\u6708\u524D`,
  years: (n) => `${String(n)} \u5E74\u524D`
};
function relativeText(bucket) {
  return (RELATIVE_UNIT[bucket.unit] ?? ((n) => `${String(n)}`))(bucket.n);
}

// src/contract.ts
var CHANNEL = "/api";
var ENDPOINT_NAMESPACE = "session-archive";
function endpointName(operation) {
  return `${ENDPOINT_NAMESPACE}.${operation}`;
}
var TRANSPORT_FAILURE = {
  badRequest: "session-archive/bad-request",
  handlerFailed: "session-archive/handler-failed",
  noConnection: "session-archive/no-connection",
  transport: "session-archive/transport"
};

// src/client/transport/archive-api.ts
function createArchiveApi(ctx) {
  async function invoke(operation, payload, signal) {
    const connection = ctx.get("connection");
    const rpc = connection?.rpc;
    if (rpc === void 0) {
      return {
        ok: false,
        code: TRANSPORT_FAILURE.noConnection,
        message: "this profile does not mount the connection service"
      };
    }
    try {
      const result = await rpc.call(CHANNEL, endpointName(operation), payload, signal);
      return result.ok ? { ok: true, value: result.value } : { ok: false, code: result.error.code, message: result.error.message };
    } catch (error) {
      return {
        ok: false,
        code: TRANSPORT_FAILURE.transport,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  return {
    capabilities: (payload, signal) => invoke("capabilities", payload, signal),
    list: (payload, signal) => invoke("list", payload, signal),
    unarchive: (payload, signal) => invoke("unarchive", payload, signal),
    delete: (payload, signal) => invoke("delete", payload, signal),
    archiveWorkspace: (payload, signal) => invoke("archiveWorkspace", payload, signal),
    archiveUngrouped: (payload, signal) => invoke("archiveUngrouped", payload, signal),
    shutdownAll: (payload, signal) => invoke("shutdownAll", payload, signal)
  };
}

// src/client/panel/ShutdownAll.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function ShutdownAll({ api, enabled }) {
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)(void 0);
  const shutdown = (0, import_react.useCallback)(async () => {
    if (busy) return;
    setBusy(true);
    const outcome = await api.shutdownAll({});
    setBusy(false);
    if (!outcome.ok) {
      setMessage(callFailureText(outcome));
      return;
    }
    const failures = outcome.value.outcomes.filter((item) => !item.ok);
    setMessage(
      outcome.value.outcomes.length === 0 ? text.nothingRunning : [
        text.shutdownCount(outcome.value.outcomes.length - failures.length),
        ...failures.length > 0 ? [text.partialFailure(failures.length)] : []
      ].join("\uFF1B")
    );
  }, [api, busy]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: busy || !enabled, onClick: () => void shutdown(), children: text.shutdownAll }),
    message === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: message })
  ] });
}

// src/client/panel/useArchive.ts
var import_react2 = require("react");
function useArchive(api, open, copy2) {
  const { describe, transport, unarchived: unarchivedText, deleted: deletedText } = copy2;
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [listing, setListing] = (0, import_react2.useState)(void 0);
  const [capabilities, setCapabilities] = (0, import_react2.useState)(void 0);
  const [loadError, setLoadError] = (0, import_react2.useState)(void 0);
  const [selected, setSelected] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [report, setReport] = (0, import_react2.useState)(void 0);
  const [generation, setGeneration] = (0, import_react2.useState)(0);
  const reload = (0, import_react2.useCallback)(() => {
    setGeneration((value) => value + 1);
  }, []);
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(void 0);
    void (async () => {
      const [capability, list] = await Promise.all([
        api.capabilities({}, controller.signal),
        api.list({}, controller.signal)
      ]);
      if (controller.signal.aborted) return;
      if (capability.ok) setCapabilities(capability.value);
      if (list.ok) {
        setListing(list.value);
        const present = new Set(list.value.entries.map((entry) => entry.id));
        setSelected((current) => new Set([...current].filter((id) => present.has(id))));
      } else {
        setLoadError(transport(list));
      }
      setLoading(false);
    })();
    return () => {
      controller.abort();
    };
  }, [api, open, generation, transport]);
  (0, import_react2.useEffect)(() => {
    if (open) return;
    setSelected(/* @__PURE__ */ new Set());
    setReport(void 0);
  }, [open]);
  const toggle = (0, import_react2.useCallback)((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const selectAll = (0, import_react2.useCallback)((ids) => {
    setSelected((current) => /* @__PURE__ */ new Set([...current, ...ids]));
  }, []);
  const clearSelection = (0, import_react2.useCallback)(() => {
    setSelected(/* @__PURE__ */ new Set());
  }, []);
  const run = (0, import_react2.useCallback)(
    async (operation, succeeded) => {
      const ids = [...selected];
      if (ids.length === 0 || busy) return;
      setBusy(true);
      const outcome = await operation(ids);
      setBusy(false);
      if (!outcome.ok) {
        setReport({ kind: "failed", message: transport(outcome), failures: [] });
        return;
      }
      const failures = outcome.value.outcomes.filter(
        (item) => !item.ok
      );
      const done = outcome.value.outcomes.length - failures.length;
      setReport({
        kind: failures.length === 0 ? "ok" : done === 0 ? "failed" : "partial",
        message: [...done > 0 ? [succeeded(done)] : [], ...failures.map(describe)].join("\uFF1B"),
        failures
      });
      reload();
    },
    [busy, describe, reload, selected, transport]
  );
  const unarchive = (0, import_react2.useCallback)(async () => {
    await run((ids) => api.unarchive({ ids }), unarchivedText);
  }, [api, run, unarchivedText]);
  const remove = (0, import_react2.useCallback)(async () => {
    await run((ids) => api.delete({ ids }), deletedText);
  }, [api, run, deletedText]);
  return (0, import_react2.useMemo)(
    () => ({
      api,
      loading,
      listing,
      capabilities,
      loadError,
      selected,
      busy,
      report,
      toggle,
      selectAll,
      clearSelection,
      reload,
      unarchive,
      remove
    }),
    [
      api,
      busy,
      capabilities,
      clearSelection,
      listing,
      loadError,
      loading,
      reload,
      remove,
      report,
      selectAll,
      selected,
      toggle,
      unarchive
    ]
  );
}

// src/client/panel/ArchivePanel.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var LIST_VIEWPORT = { maxHeight: "46vh", overflowY: "auto" };
var copy = {
  describe: (outcome) => `${outcome.id}: ${failureText(outcome.code)}`,
  transport: callFailureText,
  unarchived: (count) => text.unarchivedCount(count),
  deleted: (count) => text.deletedCount(count)
};
function createArchivePanel(ctx) {
  const api = createArchiveApi(ctx);
  return function ArchivePanel({ wide }) {
    const [open, setOpen] = (0, import_react3.useState)(false);
    const state = useArchive(api, open, copy);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", onClick: () => setOpen(true), title: text.entryLabel, children: wide === false ? "\u5F52" : text.entryLabel }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Modal,
        {
          open,
          onClose: () => setOpen(false),
          title: text.panelTitle,
          closeLabel: text.close,
          description: text.panelDescription,
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ArchiveBody, { state })
        }
      )
    ] });
  };
}
function ArchiveBody({ state }) {
  const [confirming, setConfirming] = (0, import_react3.useState)(false);
  const [acknowledged, setAcknowledged] = (0, import_react3.useState)(false);
  const [query, setQuery] = (0, import_react3.useState)("");
  const now = (0, import_react3.useMemo)(() => Date.now(), [state.listing]);
  const entries = state.listing?.entries ?? [];
  const view = (0, import_react3.useMemo)(() => buildArchiveView(entries, query), [entries, query]);
  const shown = (0, import_react3.useMemo)(() => view.groups.flatMap((group) => group.entries.map((entry) => entry.id)), [view]);
  const closeConfirmation = (0, import_react3.useCallback)(() => {
    setConfirming(false);
    setAcknowledged(false);
  }, []);
  const confirmDelete = (0, import_react3.useCallback)(() => {
    closeConfirmation();
    void state.remove();
  }, [closeConfirmation, state]);
  if (state.loading && state.listing === void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: text.loading });
  if (state.loadError !== void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
        text.loadFailed,
        "\uFF1A",
        state.loadError
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", onClick: state.reload, children: text.retry })
    ] });
  }
  const selectedCount = state.selected.size;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CapabilityNotices, { state }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ShutdownAll, { api: state.api, enabled: available(state, "shutdown") }),
    entries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: text.empty }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "search",
            value: query,
            placeholder: text.searchPlaceholder,
            "aria-label": text.searchPlaceholder,
            onChange: (event) => setQuery(event.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", onClick: () => state.selectAll(shown), disabled: shown.length === 0, children: text.selectAll }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", onClick: state.clearSelection, disabled: selectedCount === 0, children: text.clearSelection }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", onClick: state.reload, disabled: state.busy, children: text.refresh }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: text.selectedCount(selectedCount) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: text.totalSize((0, import_dsh_client_ui_primitives2.fileSizeText)(state.listing?.totalSizeBytes ?? 0)) }),
        view.hidden === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: text.hiddenBySearch(view.hidden) })
      ] }),
      view.groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: text.noMatch }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: LIST_VIEWPORT, children: view.groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        ArchiveGroup,
        {
          group,
          now,
          selected: state.selected,
          onToggle: state.toggle
        },
        group.workspaceId ?? ""
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: selectedCount === 0 || state.busy || !available(state, "unarchive"),
            onClick: () => void state.unarchive(),
            children: text.unarchive
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "primary",
            size: "sm",
            disabled: selectedCount === 0 || state.busy || !available(state, "delete"),
            onClick: () => setConfirming(true),
            children: text.deleteAction
          }
        )
      ] })
    ] }),
    state.report === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: state.report.message }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Diagnostics, { state }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.RiskConfirmation,
      {
        open: confirming,
        title: text.deleteTitle,
        description: deleteDescription(selectedCount),
        acknowledgeLabel: text.deleteAcknowledge,
        cancelLabel: text.deleteCancel,
        closeLabel: text.close,
        confirmLabel: text.deleteConfirm,
        acknowledged,
        disabled: state.busy,
        onAcknowledgedChange: setAcknowledged,
        onCancel: closeConfirmation,
        onConfirm: confirmDelete
      }
    )
  ] });
}
function ArchiveGroup({
  group,
  now,
  selected,
  onToggle
}) {
  const label = group.workspaceId === void 0 ? text.ungrouped : group.title !== void 0 && group.title.length > 0 ? group.title : text.untitledWorkspace;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tag, { tone: group.workspaceId === void 0 ? "quiet" : "outline", children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: text.groupSummary(group.entries.length, (0, import_dsh_client_ui_primitives2.fileSizeText)(group.sizeBytes)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { children: group.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      ArchiveRow,
      {
        entry,
        now,
        selected: selected.has(entry.id),
        onToggle: () => onToggle(entry.id)
      },
      entry.id
    )) })
  ] });
}
function ArchiveRow({
  entry,
  now,
  selected,
  onToggle
}) {
  const activity = entry.lastActivityAt ?? entry.createdAt;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: selected, onChange: onToggle }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: entryLabel(entry) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { title: new Date(entry.createdAt).toLocaleString(), children: [
      text.createdAt,
      " ",
      relativeText((0, import_dsh_client_ui_primitives2.relativeTime)(entry.createdAt, now))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { title: new Date(activity).toLocaleString(), children: [
      text.lastActivityAt,
      " ",
      relativeText((0, import_dsh_client_ui_primitives2.relativeTime)(activity, now))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: entry.sizeBytes === void 0 ? text.unknownSize : (0, import_dsh_client_ui_primitives2.fileSizeText)(entry.sizeBytes) }),
    entry.cwd === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { title: entry.cwd, children: entry.cwd })
  ] });
}
function available(state, id) {
  return state.capabilities?.capabilities[id].available ?? true;
}
function CapabilityNotices({ state }) {
  const report = state.capabilities?.capabilities;
  if (report === void 0) return null;
  const blocked = ["unarchive", "delete", "shutdown"].map((id) => ({ id, status: report[id] })).filter((entry) => !entry.status.available);
  if (blocked.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { children: blocked.map(({ id, status }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tag, { tone: "warning", children: id }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: status.code === void 0 ? "" : blockText(status.code) }),
    status.subject === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: status.subject })
  ] }, id)) });
}
function Diagnostics({ state }) {
  const listing = state.listing;
  if (listing === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { children: [
    listing.degraded ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: text.degradedMetadata }) : null,
    listing.unresolved.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      String(listing.unresolved.length),
      " ",
      text.unresolvedNotice
    ] }),
    state.capabilities === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      text.backend,
      ": ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: state.capabilities.persistenceBackend }),
      " \xB7 v",
      state.capabilities.version
    ] })
  ] });
}

// src/client/sidebar/adapter.ts
var ADAPTER_VERSION = "0.1.5-rc.1";
var INJECTED_ATTRIBUTE = "data-session-archive-row-action";
var ROW_SELECTOR = '[class*="_projectRow"]';
var ACTIONS_SELECTOR = ':scope > [class*="_rowActions"]';
var MAX_FIBER_DEPTH = 8;
var FIBER_KEY_PREFIX = "__reactFiber$";
function asRowGroup(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const group = value;
  if (typeof group["key"] !== "string") return void 0;
  if (typeof group["sessionCount"] !== "number") return void 0;
  if (typeof group["expanded"] !== "boolean") return void 0;
  if (typeof group["label"] !== "string") return void 0;
  const workspaceId = group["workspaceId"];
  if (workspaceId !== void 0 && typeof workspaceId !== "string") return void 0;
  return { workspaceId, label: group["label"], sessionCount: group["sessionCount"] };
}
function readRowGroup(element) {
  const key = Object.keys(element).find((name2) => name2.startsWith(FIBER_KEY_PREFIX));
  if (key === void 0) return void 0;
  let fiber = element[key];
  for (let depth = 0; fiber !== void 0 && fiber !== null && depth < MAX_FIBER_DEPTH; depth += 1) {
    const group = asRowGroup(fiber.memoizedProps?.["group"]);
    if (group !== void 0) return group;
    fiber = fiber.return;
  }
  return void 0;
}
function anchorOf(actions) {
  for (let child = actions.lastElementChild; child !== null; child = child.previousElementSibling) {
    if (child.hasAttribute(INJECTED_ATTRIBUTE)) continue;
    return child.tagName === "BUTTON" ? child : void 0;
  }
  return void 0;
}
function scanRows(root) {
  const rows = [];
  let unrecognized = 0;
  for (const row of root.querySelectorAll(ROW_SELECTOR)) {
    const actions = row.querySelector(ACTIONS_SELECTOR);
    const anchor = actions === null ? void 0 : anchorOf(actions);
    const group = readRowGroup(row);
    if (actions === null || anchor === void 0 || group === void 0) {
      unrecognized += 1;
      continue;
    }
    rows.push({ row, actions, anchor, group });
  }
  return { rows, unrecognized };
}

// src/client/sidebar/row-buttons.ts
var FAILURE_THRESHOLD = 8;
var ARCHIVE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><rect x="1.9" y="2.4" width="12.2" height="3.4" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M3.2 6.4v5.3c0 1.1.9 2 2 2h5.6c1.1 0 2-.9 2-2V6.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.3 9h3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
function actionable(group, blocked) {
  return blocked === void 0 && group.sessionCount > 0;
}
function createRowButtons(options) {
  const scan = options.scan ?? scanRows;
  const injected = /* @__PURE__ */ new Map();
  const reports = /* @__PURE__ */ new WeakMap();
  let failures = 0;
  let stopped = false;
  function describe(button, group) {
    const state = options.blocked ?? (group.sessionCount === 0 ? options.copy.empty(group) : options.copy.action(group));
    const label = reports.get(button) ?? state;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = !actionable(group, options.blocked);
  }
  async function run(button, row, group) {
    button.disabled = true;
    button.title = options.copy.busy;
    button.setAttribute("aria-label", options.copy.busy);
    let report;
    try {
      report = await options.archive(group);
    } catch (error) {
      report = error instanceof Error ? error.message : String(error);
    }
    if (!button.isConnected) return;
    reports.set(button, report);
    row.addEventListener("pointerleave", () => {
      reports.delete(button);
      const settled = currentGroupOf(row);
      if (settled !== void 0) describe(button, settled);
    }, { once: true });
    describe(button, currentGroupOf(row) ?? group);
  }
  function attach(target) {
    const button = target.row.ownerDocument.createElement("button");
    button.type = "button";
    button.setAttribute(INJECTED_ATTRIBUTE, ADAPTER_VERSION);
    button.className = target.anchor.className;
    button.innerHTML = ARCHIVE_ICON;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      const group = currentGroupOf(target.row) ?? target.group;
      void run(button, target.row, group);
    });
    target.actions.insertBefore(button, target.anchor);
    return button;
  }
  function currentGroupOf(row) {
    return scan(options.root).rows.find((candidate) => candidate.row === row)?.group;
  }
  function disable(reason) {
    stopped = true;
    removeAll();
    options.warn(
      `session-archive: sidebar row buttons disabled \u2014 ${reason}. The recognition rules in this build target DSH ${ADAPTER_VERSION}; the built-in sidebar is left exactly as it was.`
    );
  }
  function removeAll() {
    for (const button of injected.values()) button.remove();
    injected.clear();
  }
  function sync() {
    if (stopped) return;
    const result = scan(options.root);
    failures += result.unrecognized;
    if (failures >= FAILURE_THRESHOLD) {
      disable(`${String(failures)} sidebar rows could not be recognized`);
      return;
    }
    const live = /* @__PURE__ */ new Set();
    for (const target of result.rows) {
      live.add(target.row);
      const existing = injected.get(target.row);
      const button = existing !== void 0 && existing.isConnected ? existing : attach(target);
      injected.set(target.row, button);
      describe(button, target.group);
    }
    for (const [row, button] of injected) {
      if (live.has(row)) continue;
      button.remove();
      injected.delete(row);
    }
  }
  return {
    sync,
    dispose: () => {
      stopped = true;
      removeAll();
    }
  };
}

// src/client/sidebar/install.ts
var SCAN_INTERVAL_MS = 150;
async function archiveBlockReason(api) {
  const outcome = await api.capabilities({});
  if (!outcome.ok) return void 0;
  const status = outcome.value.capabilities.archive;
  return status.available ? void 0 : blockText(status.code ?? "probe-failed");
}
function installSidebarButtons(ctx, api) {
  ctx.effect(() => {
    let disposed = false;
    let buttons;
    const teardown = [];
    void (async () => {
      const blocked = await archiveBlockReason(api).catch(() => void 0);
      if (disposed) return;
      buttons = createRowButtons({
        root: document,
        archive: async (group) => {
          const outcome = group.workspaceId === void 0 ? await api.archiveUngrouped({}) : await api.archiveWorkspace({ workspaceId: group.workspaceId });
          return outcome.ok ? bulkArchiveSummary(outcome.value) : callFailureText(outcome);
        },
        blocked,
        copy: rowCopy,
        warn: (message) => {
          console.warn(message);
        }
      });
      let pending;
      const schedule = () => {
        if (pending !== void 0 || disposed) return;
        pending = setTimeout(() => {
          pending = void 0;
          buttons?.sync();
        }, SCAN_INTERVAL_MS);
      };
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.addedNodes.length > 0 || record.removedNodes.length > 0) return schedule();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("pointerover", schedule, { passive: true });
      teardown.push(() => {
        observer.disconnect();
        document.removeEventListener("pointerover", schedule);
        if (pending !== void 0) clearTimeout(pending);
      });
      buttons.sync();
    })();
    return () => {
      disposed = true;
      for (const dispose of teardown.splice(0)) dispose();
      buttons?.dispose();
    };
  }, "session-archive: sidebar row buttons");
}

// src/client/index.ts
var name = "session-archive-client";
var inject = ["slots"];
function apply(ctx) {
  const ArchivePanel = createArchivePanel(ctx);
  ctx.slots.inject(
    "sidebar.footer.action",
    () => ctx.slots.register(
      { name: "sidebar.footer.action", id: "session-archive", order: 400, label: () => text.entryLabel },
      ArchivePanel
    )
  );
  installSidebarButtons(ctx, createArchiveApi(ctx));
}
return module.exports; } });
