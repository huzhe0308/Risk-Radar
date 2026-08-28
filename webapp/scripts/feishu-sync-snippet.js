(function () {
  "use strict";

  // ========================================
  // 配置区 — 请修改以下两项
  // ========================================
  var SYNC_URL = "https://www.huzhe.xyz/api/feishu/sync";
  var WEBHOOK_TOKEN = "123456";
  // ========================================

  if (window.__riskRadarInjected) {
    alert("Risk Radar 脚本已运行，请勿重复执行。");
    return;
  }
  window.__riskRadarInjected = true;

  var importButton = null;

  // ========================================
  // 1. 浮动按钮 UI
  // ========================================
  function ensureButton() {
    if (importButton) return;
    importButton = document.createElement("div");
    importButton.id = "risk-radar-import-btn";
    importButton.style.cssText = [
      "position:fixed", "top:80px", "right:20px", "z-index:999999",
      "background:#4f46e5", "color:white", "padding:10px 20px",
      "border-radius:8px", "cursor:pointer", "font-size:14px",
      "box-shadow:0 2px 8px rgba(0,0,0,0.2)", "user-select:none",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "transition:all 0.2s", "max-width:300px", "text-align:center",
      "line-height:1.4", "white-space:pre-wrap"
    ].join(";") + ";";
    importButton.textContent = "📥 导入到 Risk Radar";
    importButton.onclick = handleImport;
    document.body.appendChild(importButton);
    console.log("[Risk Radar] 按钮已添加。点击即可自动读取当前表格并发送。");
  }

  function updateButton(state, extra) {
    if (!importButton) return;
    var states = {
      capturing:   { text: "⏳ 正在读取表格…",                 bg: "#d97706" },
      parsing:     { text: "⏳ 正在解析数据…",                 bg: "#d97706" },
      sending:     { text: "⏳ 正在发送 " + (extra || "") + "",  bg: "#d97706" },
      sent:        { text: "✅ 全部完成！\n" + (extra || ""),   bg: "#059669" },
      partial:     { text: "⚠️ 部分成功\n" + (extra || ""),     bg: "#d97706" },
      error:       { text: "❌ " + (extra || "失败，请重试"),    bg: "#dc2626" },
      idle:        { text: "📥 导入到 Risk Radar",              bg: "#4f46e5" },
    };
    var s = states[state] || states.idle;
    importButton.textContent = s.text;
    importButton.style.background = s.bg;
  }

  // ========================================
  // 2. 核心：从当前页面读取表格数据
  //    策略 A: 剪贴板（Ctrl+A → Ctrl+C → readText）
  //    策略 B: 自动触发下载 xlsx（拦截 createObjectURL）
  //    策略 C: 手动选文件
  // ========================================

  function findSheetContainer() {
    var selectors = [
      '[class*="sheet"][class*="container"]',
      '[class*="sheet"][class*="canvas"]',
      '[class*="spreadsheet"]',
      '[class*="grid"][class*="container"]',
      '[class*="worksheet"]',
      '[class*="render"]',
      'canvas',
      '[contenteditable="true"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        console.log("[Risk Radar] 找到表格容器:", selectors[i], el.className.slice(0, 80));
        return el;
      }
    }
    return null;
  }

  function dispatchKey(target, key, code, keyCode) {
    var events = ["keydown", "keypress", "keyup"];
    for (var i = 0; i < events.length; i++) {
      target.dispatchEvent(new KeyboardEvent(events[i], {
        key: key,
        code: code,
        keyCode: keyCode,
        which: keyCode,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    }
  }

  async function captureViaClipboard() {
    console.log("[Risk Radar] 策略 A: 尝试通过剪贴板读取...");

    var container = findSheetContainer() || document.body;
    container.focus();
    await sleep(100);

    // 先点击表格区域，确保焦点在表格上
    try {
      container.click();
      await sleep(100);
    } catch (e) {}

    // 方法 1: execCommand
    var usedExec = false;
    try {
      if (document.execCommand("selectAll")) {
        usedExec = true;
        console.log("[Risk Radar] execCommand('selectAll') 成功");
      }
    } catch (e) {}

    await sleep(100);

    var copied = false;
    try {
      copied = document.execCommand("copy");
      if (copied) console.log("[Risk Radar] execCommand('copy') 成功");
    } catch (e) {}

    // 方法 2: 如果 execCommand 失败，模拟键盘事件
    if (!copied) {
      console.log("[Risk Radar] execCommand 失败，尝试键盘事件...");
      var target = document.activeElement || container;
      dispatchKey(target, "a", "KeyA", 65);
      await sleep(200);
      dispatchKey(target, "c", "KeyC", 67);
      copied = true;
    }

    await sleep(300);

    // 读剪贴板
    var text = "";
    try {
      text = await navigator.clipboard.readText();
      console.log("[Risk Radar] 剪贴板内容长度:", text.length);
    } catch (e) {
      console.warn("[Risk Radar] 无法读取剪贴板:", e.message);
      throw new Error("无法读取剪贴板，请允许剪贴板权限");
    }

    if (!text || text.trim().length < 2) {
      throw new Error("剪贴板为空");
    }

    return text;
  }

  function parseTSV(text) {
    var lines = text.replace(/\r\n/g, "\n").split("\n").filter(function (l) {
      return l.trim().length > 0;
    });
    if (lines.length < 2) return null;

    var headers = lines[0].split("\t").map(function (h) { return h.trim(); });
    var rows = [];

    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split("\t");
      if (cells.every(function (c) { return c.trim() === ""; })) continue;

      var fields = {};
      for (var j = 0; j < headers.length; j++) {
        if (headers[j] && cells[j] != null) {
          fields[headers[j]] = cells[j].trim();
        }
      }
      rows.push(fields);
    }

    console.log("[Risk Radar] TSV 解析: " + headers.length + " 列, " + rows.length + " 行");
    return { headers: headers, rows: rows };
  }

  // ========================================
  // 3. xlsx 下载拦截（策略 B）
  // ========================================
  var capturedBlob = null;
  var originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (blob) {
    var url = originalCreateObjectURL(blob);
    if (blob instanceof Blob && blob.size > 5000) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf.slice(0, 2));
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          capturedBlob = blob;
          console.log("[Risk Radar] 已捕获 xlsx 下载: " + (blob.size / 1024).toFixed(1) + " KB");
        }
      }).catch(function () {});
    }
    return url;
  };

  function loadSheetJS() {
    return new Promise(function (resolve, reject) {
      if (window.XLSX) { resolve(); return; }
      var script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("SheetJS 加载失败")); };
      document.head.appendChild(script);
    });
  }

  async function captureViaDownload() {
    console.log("[Risk Radar] 策略 B: 尝试自动下载 xlsx...");
    capturedBlob = null;

    var triggered = tryTriggerDownload();
    if (!triggered) return null;

    var waited = 0;
    while (waited < 15000) {
      await sleep(500);
      waited += 500;
      if (capturedBlob) return capturedBlob;
    }
    return null;
  }

  function tryTriggerDownload() {
    try {
      var fileMenu = findClickableByText("文件") || findClickableByText("File");
      if (!fileMenu) return false;
      fileMenu.click();

      setTimeout(function () {
        var dlMenu =
          findClickableByText("下载为") ||
          findClickableByText("下载") ||
          findClickableByText("导出") ||
          findClickableByText("Export");
        if (!dlMenu) return;
        dlMenu.click();

        setTimeout(function () {
          var excelOpt =
            findClickableByText("Microsoft Excel") ||
            findClickableByText("Excel") ||
            findClickableByText(".xlsx");
          if (excelOpt) excelOpt.click();
        }, 600);
      }, 600);

      return true;
    } catch (e) {
      return false;
    }
  }

  function findClickableByText(text) {
    var els = document.querySelectorAll("div,span,button,a,li");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var c = (el.textContent || "").trim();
      if (c === text || (c.indexOf(text) !== -1 && c.length < text.length + 10)) {
        if (
          el.onclick ||
          el.getAttribute("role") === "menuitem" ||
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          (el.className && el.className.indexOf("menu") !== -1) ||
          (el.className && el.className.indexOf("dropdown") !== -1)
        ) {
          return el;
        }
      }
    }
    return null;
  }

  // ========================================
  // 4. 发送数据到 sync API
  // ========================================
  async function sendRows(rows, sheetName) {
    if (rows.length === 0) {
      updateButton("error", "未解析到有效数据");
      return;
    }

    if (WEBHOOK_TOKEN === "YOUR_FEISHU_WEBHOOK_TOKEN_HERE") {
      updateButton("error", "请先在脚本顶部填写 WEBHOOK_TOKEN");
      return;
    }

    var success = 0;
    var failed = 0;
    var errors = [];

    for (var k = 0; k < rows.length; k++) {
      var fields = rows[k];
      updateButton("sending", (k + 1) + "/" + rows.length);

      var recordId =
        fields["项目ID"] || fields["project_id"] || fields["uuid"] ||
        fields["项目名称"] || fields["项目名"] || fields["name"] ||
        fields["里程碑名称"] || fields["里程碑"] ||
        "feishu_" + (sheetName || "sheet") + "_row" + (k + 1);

      var payload = {
        record_id: String(recordId).trim(),
        type: "project",
        action: "create",
        table_id: sheetName || "Sheet1",
        fields: fields,
      };

      try {
        var resp = await fetch(SYNC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Token": WEBHOOK_TOKEN,
          },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          success++;
        } else {
          failed++;
          var errText = "";
          try { errText = (await resp.json()).error || ""; } catch (_) {}
          errors.push("行" + (k + 1) + ": " + errText);
          console.warn("[Risk Radar] 行" + (k + 1) + " 失败:", resp.status, errText);
        }
      } catch (e) {
        failed++;
        errors.push("行" + (k + 1) + ": " + e.message);
      }
    }

    if (failed === 0) {
      updateButton("sent", success + " 行已同步");
    } else {
      updateButton("partial", success + " 成功 / " + failed + " 失败");
      console.warn("[Risk Radar] 错误详情:\n" + errors.join("\n"));
    }

    setTimeout(function () { updateButton("idle"); }, 8000);
  }

  async function sendXlsxRows(blob) {
    updateButton("parsing");
    await loadSheetJS();

    var arrayBuffer = await blob.arrayBuffer();
    var workbook = XLSX.read(arrayBuffer, { type: "array" });

    for (var s = 0; s < workbook.SheetNames.length; s++) {
      var sheetName = workbook.SheetNames[s];
      var sheet = workbook.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) continue;

      var headers = rows[0].map(function (h) { return String(h).trim(); });
      var fieldRows = [];

      for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        if (row.every(function (c) { return c === "" || c == null; })) continue;
        var fields = {};
        for (var j = 0; j < headers.length; j++) {
          if (headers[j] && row[j] != null && row[j] !== "") {
            fields[headers[j]] = String(row[j]);
          }
        }
        fieldRows.push(fields);
      }

      await sendRows(fieldRows, sheetName);
    }
  }

  // ========================================
  // 5. 主入口
  // ========================================
  async function handleImport() {
    updateButton("capturing");

    // 策略 A: 剪贴板
    try {
      var text = await captureViaClipboard();
      var parsed = parseTSV(text);
      if (parsed && parsed.rows.length > 0) {
        console.log("[Risk Radar] 策略 A 成功，开始发送...");
        await sendRows(parsed.rows, "当前工作表");
        return;
      }
    } catch (e) {
      console.warn("[Risk Radar] 策略 A 失败:", e.message);
    }

    // 策略 B: 自动下载 xlsx
    updateButton("capturing");
    console.log("[Risk Radar] 尝试策略 B...");
    var blob = await captureViaDownload();
    if (blob) {
      console.log("[Risk Radar] 策略 B 成功，解析 xlsx...");
      await sendXlsxRows(blob);
      return;
    }

    // 策略 C: 手动选文件
    console.log("[Risk Radar] 所有自动策略失败，请手动选择文件");
    updateButton("idle");
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = function (e) {
      var file = e.target.files[0];
      if (file) sendXlsxRows(file);
    };
    input.click();
  }

  // ========================================
  // 6. 工具函数
  // ========================================
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ========================================
  // 7. 初始化
  // ========================================
  ensureButton();
})();
