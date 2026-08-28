(function () {
  "use strict";

  // ========================================
  // 0. 防止重复注入
  // ========================================
  if (window.__riskRadarInjected) {
    alert("Risk Radar 脚本已运行，请勿重复执行。");
    return;
  }
  window.__riskRadarInjected = true;

  var capturedBlob = null;
  var importButton = null;

  // ========================================
  // 1. 拦截下载 (createObjectURL) — 捕获 xlsx 文件
  // ========================================
  var originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (blob) {
    var url = originalCreateObjectURL(blob);
    if (blob instanceof Blob && blob.size > 5000) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf.slice(0, 2));
        // ZIP 魔术字节: PK (0x50 0x4B) — xlsx 本质是 ZIP
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          capturedBlob = blob;
          updateButton("captured");
          console.log("[Risk Radar] 已捕获 xlsx 文件，" + (blob.size / 1024).toFixed(1) + " KB");
        }
      }).catch(function () {});
    }
    return url;
  };

  // 拦截 <a download> 点击
  document.addEventListener("click", function (e) {
    var link = e.target && e.target.closest && e.target.closest("a[download]");
    if (link && link.href) {
      var fn = (link.download || "").toLowerCase();
      if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) {
        fetch(link.href).then(function (r) { return r.blob(); }).then(function (b) {
          capturedBlob = b;
          updateButton("captured");
        }).catch(function () {});
      }
    }
  }, true);

  // ========================================
  // 2. 拦截 fetch 响应 — 备用数据捕获
  // ========================================
  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return originalFetch.apply(this, args).then(function (response) {
      try {
        var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        if (/sheet|spreadsheet|values|grid/i.test(url)) {
          var clone = response.clone();
          clone.text().then(function (text) {
            if (/values|cells|sheet_id|gridProperties/i.test(text) && !capturedBlob) {
              window.__riskRadarFetchData = window.__riskRadarFetchData || [];
              try { window.__riskRadarFetchData.push({ url: url, data: JSON.parse(text) }); } catch (e) {}
            }
          }).catch(function () {});
        }
      } catch (e) {}
      return response;
    });
  };

  // ========================================
  // 3. 浮动按钮 UI
  // ========================================
  function ensureButton() {
    if (importButton) { importButton.remove(); importButton = null; }

    importButton = document.createElement("div");
    importButton.id = "risk-radar-import-btn";
    importButton.style.cssText = [
      "position:fixed", "top:80px", "right:20px", "z-index:999999",
      "background:#4f46e5", "color:white", "padding:10px 20px",
      "border-radius:8px", "cursor:pointer", "font-size:14px",
      "box-shadow:0 2px 8px rgba(0,0,0,0.2)", "user-select:none",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "transition:all 0.2s", "max-width:260px", "text-align:center",
      "line-height:1.4"
    ].join(";") + ";";
    importButton.textContent = "📥 导入到 Risk Radar";
    importButton.onclick = handleImport;
    document.body.appendChild(importButton);
    console.log("[Risk Radar] 按钮已添加，请先在飞书中下载表格为 xlsx，脚本会自动捕获。");
  }

  function updateButton(state) {
    if (!importButton) return;
    var states = {
      captured:      { text: "✅ 已捕获文件，点击发送",        bg: "#059669" },
      triggering:   { text: "⏳ 正在导出表格…",               bg: "#d97706" },
      sending:      { text: "⏳ 正在发送…",                   bg: "#d97706" },
      sent:         { text: "✅ 已发送！正在打开…",            bg: "#059669" },
      error:        { text: "❌ 发送失败，请重试",             bg: "#dc2626" },
      "no-service": { text: "❌ 无法连接本地服务\n请确认 Risk Radar 已启动", bg: "#dc2626" },
      idle:         { text: "📥 导入到 Risk Radar",            bg: "#4f46e5" },
    };
    var s = states[state] || states.idle;
    importButton.textContent = s.text;
    importButton.style.background = s.bg;
    importButton.style.whiteSpace = "pre-wrap";
  }

  // ========================================
  // 4. 导入处理
  // ========================================
  function handleImport() {
    if (capturedBlob) {
      sendBlob(capturedBlob);
      return;
    }

    // 尝试自动触发"下载为 Excel"
    updateButton("triggering");
    var triggered = tryTriggerDownload();

    if (triggered) {
      var waited = 0;
      var interval = setInterval(function () {
        waited += 500;
        if (capturedBlob) {
          clearInterval(interval);
          sendBlob(capturedBlob);
        } else if (waited > 10000) {
          clearInterval(interval);
          showFilePicker();
        }
      }, 500);
    } else {
      showFilePicker();
    }
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

  function showFilePicker() {
    updateButton("idle");
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = function (e) {
      var file = e.target.files[0];
      if (file) {
        capturedBlob = file;
        updateButton("captured");
        sendBlob(file);
      }
    };
    input.click();
  }

  // ========================================
  // 5. 发送到本地 Risk Radar (使用 fetch，不依赖 GM_xmlhttpRequest)
  // ========================================
  function sendBlob(blob) {
    updateButton("sending");
    blob.arrayBuffer().then(function (arrayBuffer) {
      fetch("http://127.0.0.1:3999/import-raw", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: arrayBuffer,
      })
        .then(function (response) {
          if (response.ok) {
            updateButton("sent");
            setTimeout(function () {
              window.open("http://localhost:3000/?from=feishu-script", "_blank");
            }, 500);
            setTimeout(function () {
              capturedBlob = null;
              updateButton("idle");
            }, 5000);
          } else {
            updateButton("error");
            setTimeout(function () { updateButton("idle"); }, 3000);
          }
        })
        .catch(function (err) {
          console.error("[Risk Radar] 发送失败:", err);
          updateButton("no-service");
          setTimeout(function () { updateButton("idle"); }, 4000);
        });
    }).catch(function () {
      updateButton("error");
      setTimeout(function () { updateButton("idle"); }, 3000);
    });
  }

  // ========================================
  // 6. 初始化
  // ========================================
  ensureButton();
  console.log("[Risk Radar] 脚本已注入。操作步骤：");
  console.log("  1. 在飞书中点击 文件 → 下载为 → Excel (.xlsx)");
  console.log("  2. 脚本会自动捕获下载的文件");
  console.log("  3. 点击右上角按钮发送到 Risk Radar");
  console.log("  如果自动捕获失败，点击按钮后可选择本地文件手动发送");
})();
