// ==UserScript==
// @name         飞书表格 → Risk Radar
// @namespace    risk-radar
// @version      1.0
// @description  从飞书网页表格一键导出并导入到本地 Risk Radar 系统（无需发布应用）
// @match        https://*.feishu.cn/*
// @match        https://*.larksuite.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var capturedBlob = null;
  var importButton = null;

  // ========================================
  // 1. Intercept downloads (createObjectURL)
  // ========================================
  var originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (blob) {
    var url = originalCreateObjectURL(blob);
    if (blob instanceof Blob && blob.size > 5000) {
      blob
        .arrayBuffer()
        .then(function (buf) {
          var bytes = new Uint8Array(buf.slice(0, 2));
          // ZIP magic bytes: PK (0x50 0x4B) — xlsx files are ZIP archives
          if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            capturedBlob = blob;
            updateButton("captured");
          }
        })
        .catch(function () {});
    }
    return url;
  };

  // Also intercept <a download> clicks
  document.addEventListener(
    "click",
    function (e) {
      var link = e.target && e.target.closest && e.target.closest("a[download]");
      if (link && link.href) {
        var fn = (link.download || "").toLowerCase();
        if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) {
          fetch(link.href)
            .then(function (r) { return r.blob(); })
            .then(function (b) {
              capturedBlob = b;
              updateButton("captured");
            })
            .catch(function () {});
        }
      }
    },
    true
  );

  // ========================================
  // 2. Intercept fetch responses (bonus capture)
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
              // Store raw JSON as fallback — will be sent if no xlsx is captured
              window.__riskRadarFetchData = window.__riskRadarFetchData || [];
              try {
                window.__riskRadarFetchData.push({ url: url, data: JSON.parse(text) });
              } catch (e) {}
            }
          }).catch(function () {});
        }
      } catch (e) {}
      return response;
    });
  };

  // ========================================
  // 3. Floating button UI
  // ========================================
  function isSpreadsheetPage() {
    var p = location.pathname;
    return p.indexOf("/sheets/") !== -1 || p.indexOf("/wiki/") !== -1;
  }

  function ensureButton() {
    if (!isSpreadsheetPage()) {
      if (importButton) { importButton.remove(); importButton = null; }
      return;
    }
    if (importButton) return;
    importButton = document.createElement("div");
    importButton.id = "risk-radar-import-btn";
    importButton.style.cssText = [
      "position:fixed", "top:80px", "right:20px", "z-index:999999",
      "background:#4f46e5", "color:white", "padding:10px 20px",
      "border-radius:8px", "cursor:pointer", "font-size:14px",
      "box-shadow:0 2px 8px rgba(0,0,0,0.2)", "user-select:none",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "transition:all 0.2s", "max-width:260px",
    ].join(";") + ";";
    importButton.textContent = "\u{1F4E5} 导入到 Risk Radar";
    importButton.onclick = handleImport;
    document.body.appendChild(importButton);
  }

  function updateButton(state) {
    if (!importButton) return;
    var states = {
      captured: { text: "\u2705 已捕获文件，点击发送", bg: "#059669" },
      triggering: { text: "\u23F3 正在导出表格…", bg: "#d97706" },
      sending: { text: "\u23F3 正在发送…", bg: "#d97706" },
      sent: { text: "\u2705 已发送！正在打开…", bg: "#059669" },
      error: { text: "\u274C 发送失败，请重试", bg: "#dc2626" },
      "no-service": { text: "\u274C 无法连接本地服务\n请确认 Risk Radar 已启动", bg: "#dc2626" },
      idle: { text: "\u{1F4E5} 导入到 Risk Radar", bg: "#4f46e5" },
    };
    var s = states[state] || states.idle;
    importButton.textContent = s.text;
    importButton.style.background = s.bg;
  }

  // Check periodically if on a spreadsheet page (feishu is SPA)
  setInterval(ensureButton, 2000);

  // ========================================
  // 4. Import handler
  // ========================================
  function handleImport() {
    if (capturedBlob) {
      sendBlob(capturedBlob);
      return;
    }

    // Try to trigger "Download as Excel" from feishu's menu
    updateButton("triggering");
    var triggered = tryTriggerDownload();

    if (triggered) {
      // Wait for blob capture
      var waited = 0;
      var interval = setInterval(function () {
        waited += 500;
        if (capturedBlob) {
          clearInterval(interval);
          sendBlob(capturedBlob);
        } else if (waited > 10000) {
          clearInterval(interval);
          // Fallback: file picker
          showFilePicker();
        }
      }, 500);
    } else {
      // Menu automation failed — show file picker
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
          el.className.indexOf("menu") !== -1 ||
          el.className.indexOf("dropdown") !== -1
        ) {
          return el;
        }
      }
    }
    return null;
  }

  function showFilePicker() {
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
  // 5. Send to local Risk Radar
  // ========================================
  function sendBlob(blob) {
    updateButton("sending");
    blob
      .arrayBuffer()
      .then(function (arrayBuffer) {
        GM_xmlhttpRequest({
          method: "POST",
          url: "http://127.0.0.1:3999/import-raw",
          headers: { "Content-Type": "application/octet-stream" },
          data: arrayBuffer,
          timeout: 30000,
          onload: function (response) {
            if (response.status === 200) {
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
          },
          onerror: function () {
            updateButton("no-service");
            setTimeout(function () { updateButton("idle"); }, 4000);
          },
          ontimeout: function () {
            updateButton("no-service");
            setTimeout(function () { updateButton("idle"); }, 4000);
          },
        });
      })
      .catch(function () {
        updateButton("error");
        setTimeout(function () { updateButton("idle"); }, 3000);
      });
  }

  // ========================================
  // 6. Init
  // ========================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton);
  } else {
    ensureButton();
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("\u{1F4E5} 导入到 Risk Radar", handleImport);
  }
})();
