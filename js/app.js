(function () {
    "use strict";

    var APP_NAME = "parallel-coordinates";
    var API_BASE = "https://api.dataviz.jp/api/projects";
    var SUPABASE_URL = "https://vebhoeiltxspsurqoxvl.supabase.co";
    var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlYmhvZWlsdHhzcHN1cnFveHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNTY4MjMsImV4cCI6MjA4MDYzMjgyM30.5uf-D07Hb0JxL39X9yQ20P-5gFc1CRMdKWhDySrNZ0E";
    var shareSupabase = null;

    var pc = null;
    var allData = [];
    var rawData = [];
    var allKeys = [];
    var numericKeys = [];
    var currentProjectId = null;

    var isJa = /^ja\b/.test(navigator.language || "");
    var i18n = {
        title: isJa ? "パラレルコーディネイトチャート" : "Parallel Coordinates Chart",
        upload: isJa ? "CSV アップロード" : "CSV Upload",
        hint: isJa
            ? "軸を縦にドラッグしてフィルタリング ／ 横にドラッグして並べ替え"
            : "Drag vertically on axes to filter / Drag horizontally to reorder",
        scaleTooltip: isJa
            ? '<b>Original</b>: 元の数値をそのまま表示します。<br>'
              + '<b>Min-Max (0-1)</b>: 各軸の値を最小値=0、最大値=1に正規化します。異なる単位の指標を同じスケールで比較できます。<br>'
              + '<b>Z-Score</b>: 各軸の値を平均=0、標準偏差=1に標準化します。外れ値の把握に有効です。'
            : '<b>Original</b>: Display raw values as-is.<br>'
              + '<b>Min-Max (0-1)</b>: Normalize each axis to min=0, max=1. Useful for comparing metrics with different units.<br>'
              + '<b>Z-Score</b>: Standardize each axis to mean=0, std=1. Useful for spotting outliers.',
        rows: isJa ? "行" : "rows",
        sample: isJa ? "サンプル" : "Sample",
        projectName: isJa ? "プロジェクト名を入力してください" : "Enter a project name",
        saving: isJa ? "保存中..." : "Saving...",
        saved: isJa ? "保存しました" : "Saved",
        loading: isJa ? "読み込み中..." : "Loading...",
        loaded: isJa ? "読み込みました" : "Loaded",
        saveError: isJa ? "保存に失敗しました" : "Save failed",
        loadError: isJa ? "読み込みに失敗しました" : "Load failed",
        noProjects: isJa ? "保存されたプロジェクトがありません" : "No saved projects",
        projects: isJa ? "プロジェクト一覧" : "Projects",
        noData: isJa ? "データがありません" : "No data loaded",
        authRequired: isJa ? "ログインが必要です" : "Login required",
        shareChart: isJa ? "シェア" : "Share",
        shareTitle: isJa ? "シェアするチャートのタイトルを入力:" : "Enter a title for the shared chart:",
        shareFailed: isJa ? "シェアに失敗: " : "Share failed: ",
        shareNoData: isJa ? "データがありません" : "No data loaded",
        shareCopyUrl: isJa ? "URLをコピー" : "Copy URL",
        shareCopied: isJa ? "コピーしました!" : "Copied!",
        shareOnX: isJa ? "Xでシェア" : "Share on X",
        shareClose: isJa ? "閉じる" : "Close",
        shareModalTitle: isJa ? "シェアURLが作成されました" : "Share URL created"
    };

    document.addEventListener("DOMContentLoaded", function () {
        // Apply i18n texts
        document.getElementById("page-title").textContent = i18n.title;
        document.documentElement.lang = isJa ? "ja" : "en";
        var uploadLabel = document.getElementById("upload-label");
        var nodes = uploadLabel.childNodes;
        for (var n = 0; n < nodes.length; n++) {
            if (nodes[n].nodeType === 3 && nodes[n].textContent.trim()) {
                nodes[n].textContent = "\n                    " + i18n.upload + "\n                    ";
                break;
            }
        }
        document.getElementById("chart-hint").textContent = i18n.hint;
        document.getElementById("scale-tooltip").innerHTML = i18n.scaleTooltip;

        // Tool header setup
        var toolHeader = document.querySelector("dataviz-tool-header");
        if (toolHeader) {
            toolHeader.setConfig({
                logo: { type: "text", text: "Parallel Coordinates" },
                buttons: [
                    { label: isJa ? "プロジェクトの保存" : "Save Project", action: function () { saveToCloud(); }, align: "right" },
                    { label: isJa ? "プロジェクトの読込" : "Load Project", action: function () { loadFromCloud(); }, align: "right" }
                ]
            });
        }

        // Share button
        document.getElementById("share-btn").textContent = i18n.shareChart;
        document.getElementById("share-btn").addEventListener("click", shareToWeb);

        // Sample data
        document.getElementById("load-sample").textContent = i18n.sample;
        document.getElementById("load-sample").addEventListener("click", function () {
            d3.csv("data/yogurt.csv", function (data) {
                loadData(data);
            });
        });

        // CSV upload
        document.getElementById("file-input").addEventListener("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (event) {
                var buffer = event.target.result;
                var text = new TextDecoder("utf-8").decode(buffer);
                if (text.indexOf("\uFFFD") !== -1) {
                    text = new TextDecoder("shift-jis").decode(buffer);
                }
                if (text.charCodeAt(0) === 0xFEFF) {
                    text = text.slice(1);
                }
                var parsed = d3.csv.parse(dedupHeaders(text));
                loadData(parsed);
            };
            reader.readAsArrayBuffer(file);
            e.target.value = "";
        });

        // Scale mode
        document.getElementById("scale-mode").addEventListener("change", function () {
            if (rawData.length === 0) return;
            applyScaleAndRender();
        });

        // Reset
        document.getElementById("reset-btn").addEventListener("click", function () {
            if (!pc) return;
            pc.brushReset();
            updateTable(allData);
            updateCount(allData.length, allData.length);
        });

        // Export CSV
        document.getElementById("export-csv").addEventListener("click", function () {
            var brushed = (pc && pc.brushed() && pc.brushed().length > 0)
                ? pc.brushed() : allData;
            var csv = allKeys.map(function (k) {
                return k.indexOf(",") >= 0 ? '"' + k + '"' : k;
            }).join(",") + "\n";
            brushed.forEach(function (row) {
                csv += allKeys.map(function (k) {
                    var v = row[k];
                    if (v === null || v === undefined) return "";
                    var s = String(v);
                    return s.indexOf(",") >= 0 ? '"' + s + '"' : s;
                }).join(",") + "\n";
            });
            var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "filtered_data.csv";
            a.click();
            URL.revokeObjectURL(url);
        });

        // Helper: inline CSS-applied transforms onto SVG axis labels for export
        function inlineAxisLabelTransforms(svgClone) {
            var labels = svgClone.querySelectorAll(".axis > text, text.label");
            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];
                var existing = label.getAttribute("transform") || "";
                // Replace the library's translate(0,-5) with CSS's translateY(-14px)
                if (existing.indexOf("translate(0,-5)") >= 0) {
                    label.setAttribute("transform", existing.replace("translate(0,-5)", "translate(0,-14)"));
                } else if (existing.indexOf("translate(0, -5)") >= 0) {
                    label.setAttribute("transform", existing.replace("translate(0, -5)", "translate(0,-14)"));
                }
            }
        }

        // Helper: prepare SVG string with proper dimensions and inline styles for export
        function prepareSvgForExport(svgEl) {
            var clone = svgEl.cloneNode(true);
            var svgRect = svgEl.getBoundingClientRect();
            clone.setAttribute("width", svgRect.width);
            clone.setAttribute("height", svgRect.height);
            inlineAxisLabelTransforms(clone);
            var texts = clone.querySelectorAll("text");
            for (var i = 0; i < texts.length; i++) {
                if (!texts[i].style.fontSize) {
                    texts[i].style.fontSize = "11px";
                }
            }
            return clone;
        }

        // Export SVG
        document.getElementById("export-svg").addEventListener("click", function () {
            var container = document.getElementById("parcoords-chart");
            var canvases = container.querySelectorAll("canvas");
            var svgEl = container.querySelector("svg");
            var w = container.clientWidth;
            var h = container.clientHeight;
            var containerRect = container.getBoundingClientRect();

            var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            svg.setAttribute("width", w);
            svg.setAttribute("height", h);

            var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("width", w);
            rect.setAttribute("height", h);
            rect.setAttribute("fill", "#fff");
            svg.appendChild(rect);

            for (var i = 0; i < canvases.length; i++) {
                var canvas = canvases[i];
                var canvasRect = canvas.getBoundingClientRect();
                var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
                img.setAttribute("x", canvasRect.left - containerRect.left);
                img.setAttribute("y", canvasRect.top - containerRect.top);
                img.setAttribute("width", canvasRect.width);
                img.setAttribute("height", canvasRect.height);
                img.setAttributeNS("http://www.w3.org/1999/xlink", "href", canvas.toDataURL("image/png"));
                svg.appendChild(img);
            }

            if (svgEl) {
                var clone = prepareSvgForExport(svgEl);
                var svgRect = svgEl.getBoundingClientRect();
                var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                var offsetX = svgRect.left - containerRect.left;
                var offsetY = svgRect.top - containerRect.top;
                g.setAttribute("transform", "translate(" + offsetX + "," + offsetY + ")");
                while (clone.childNodes.length > 0) {
                    g.appendChild(clone.childNodes[0]);
                }
                svg.appendChild(g);
            }

            // Embed stylesheet to fix brush rect styles for standalone SVG.
            // Use SVG 1.1 compatible syntax (no rgba, use stroke-opacity instead)
            var styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
            styleEl.textContent =
                ".brush rect.background { fill: none !important; stroke: none !important; }" +
                ".brush rect.extent { fill: none !important; stroke: #000 !important; stroke-opacity: 0.6 !important; stroke-width: 1 !important; }" +
                ".brush .resize rect { fill: none !important; stroke: none !important; }";
            svg.insertBefore(styleEl, svg.firstChild);

            var serializer = new XMLSerializer();
            var svgStr = serializer.serializeToString(svg);
            svgStr = svgStr.replace(/fill:\s*transparent/g, "fill:none");
            var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "chart.svg";
            a.click();
            URL.revokeObjectURL(url);
        });

        // Export PNG
        document.getElementById("export-png").addEventListener("click", function () {
            var container = document.getElementById("parcoords-chart");
            var canvases = container.querySelectorAll("canvas");
            var svgEl = container.querySelector("svg");
            var w = container.clientWidth;
            var h = container.clientHeight;
            var containerRect = container.getBoundingClientRect();

            var offscreen = document.createElement("canvas");
            offscreen.width = w;
            offscreen.height = h;
            var ctx = offscreen.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);

            for (var i = 0; i < canvases.length; i++) {
                var canvas = canvases[i];
                var canvasRect = canvas.getBoundingClientRect();
                // Draw canvas at its container-relative position with CSS display size
                ctx.drawImage(canvas,
                    canvasRect.left - containerRect.left,
                    canvasRect.top - containerRect.top,
                    canvasRect.width, canvasRect.height);
            }

            if (svgEl) {
                var clone = prepareSvgForExport(svgEl);
                var serializer = new XMLSerializer();
                var svgStr = serializer.serializeToString(clone);
                var svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
                var svgUrl = URL.createObjectURL(svgBlob);
                var img = new Image();
                img.onload = function () {
                    var svgRect = svgEl.getBoundingClientRect();
                    // Draw SVG at its container-relative position
                    var offsetX = svgRect.left - containerRect.left;
                    var offsetY = svgRect.top - containerRect.top;
                    ctx.drawImage(img, offsetX, offsetY);
                    URL.revokeObjectURL(svgUrl);
                    var a = document.createElement("a");
                    a.href = offscreen.toDataURL("image/png");
                    a.download = "chart.png";
                    a.click();
                };
                img.src = svgUrl;
            } else {
                var a = document.createElement("a");
                a.href = offscreen.toDataURL("image/png");
                a.download = "chart.png";
                a.click();
            }
        });

        // Table row hover → highlight line in chart
        var tbody = document.querySelector("#data-table tbody");
        tbody.addEventListener("mouseover", function (e) {
            var tr = e.target.closest("tr");
            if (!tr || !pc) return;
            var idx = tr.dataset.idx;
            if (idx !== undefined) {
                pc.highlight([allData[+idx]]);
            }
        });
        tbody.addEventListener("mouseout", function () {
            if (pc) pc.unhighlight();
        });

        // Modal close
        document.getElementById("modal-close").addEventListener("click", closeModal);
        document.getElementById("project-modal").addEventListener("click", function (e) {
            if (e.target === this) closeModal();
        });

        // Resize
        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (!pc) return;
                pc.width(chartWidth()).height(chartHeight()).render();
            }, 200);
        });

        // Auto-load from URL parameter ?project_id=
        var params = new URLSearchParams(window.location.search);
        var projectId = params.get("project_id");
        if (projectId) {
            loadProjectById(projectId);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    });

    // ─── Data loading ───

    function loadData(data) {
        if (!data || data.length === 0) return;
        allKeys = Object.keys(data[0]);
        var result = coerceNumericFields(data);
        numericKeys = result.numericKeys;
        rawData = result.data.map(function (row) {
            var copy = {};
            allKeys.forEach(function (k) { copy[k] = row[k]; });
            return copy;
        });
        currentProjectId = null;
        document.getElementById("scale-mode").value = "original";
        applyScaleAndRender();
    }

    function applyScaleAndRender(axisOrder, brushExtents) {
        var mode = document.getElementById("scale-mode").value;
        allData = rawData.map(function (row) {
            var copy = {};
            allKeys.forEach(function (k) { copy[k] = row[k]; });
            return copy;
        });

        if (mode === "normalize") {
            normalizeMinMax(allData, numericKeys);
        } else if (mode === "standardize") {
            standardizeZScore(allData, numericKeys);
        }

        var dimsOrder = axisOrder || numericKeys;
        renderChart(allData, dimsOrder, brushExtents);
        updateTable(allData);
        updateCount(allData.length, allData.length);
    }

    // ─── Cloud save/load ───

    function getAuthToken() {
        if (!window.datavizSupabase) return Promise.reject(new Error("Not authenticated"));
        return window.datavizSupabase.auth.getSession().then(function (result) {
            var session = result.data.session;
            if (!session) throw new Error("No session");
            return session.access_token;
        });
    }

    function getProjectData() {
        return {
            version: 1,
            data: rawData,
            allKeys: allKeys,
            numericKeys: numericKeys,
            settings: {
                scaleMode: document.getElementById("scale-mode").value,
                axisOrder: pc ? Object.keys(pc.dimensions()) : numericKeys,
                brushExtents: pc ? pc.brushExtents() : {}
            }
        };
    }

    function restoreProject(project) {
        if (!project.data || !project.allKeys) return;
        allKeys = project.allKeys;
        numericKeys = project.numericKeys || [];
        rawData = project.data;
        var settings = project.settings || {};
        document.getElementById("scale-mode").value = settings.scaleMode || "original";
        applyScaleAndRender(settings.axisOrder, settings.brushExtents);
    }

    function generateThumbnail(callback) {
        var container = document.getElementById("parcoords-chart");
        var canvases = container.querySelectorAll("canvas");
        if (canvases.length === 0) { callback(null); return; }
        var w = container.clientWidth;
        var h = container.clientHeight;
        var offscreen = document.createElement("canvas");
        offscreen.width = w;
        offscreen.height = h;
        var ctx = offscreen.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        for (var i = 0; i < canvases.length; i++) {
            ctx.drawImage(canvases[i], canvases[i].offsetLeft, canvases[i].offsetTop);
        }
        var svgEl = container.querySelector("svg");
        if (svgEl) {
            var svgStr = new XMLSerializer().serializeToString(svgEl);
            var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                callback(offscreen.toDataURL("image/png"));
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                callback(offscreen.toDataURL("image/png"));
            };
            img.src = url;
        } else {
            callback(offscreen.toDataURL("image/png"));
        }
    }

    // ─── Share to web ───

    function getShareSupabase() {
        if (!shareSupabase && window.supabase) {
            shareSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return shareSupabase;
    }

    function generateOgImage(title, callback) {
        var container = document.getElementById("parcoords-chart");
        var canvases = container.querySelectorAll("canvas");
        if (canvases.length === 0) { callback(null); return; }

        var OG_W = 1200, OG_H = 630;
        var chartW = container.clientWidth;
        var chartH = container.clientHeight;

        var ogCanvas = document.createElement("canvas");
        ogCanvas.width = OG_W;
        ogCanvas.height = OG_H;
        var ctx = ogCanvas.getContext("2d");

        // White background
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, OG_W, OG_H);

        // Scale chart to fit OG image (reserve 60px for title bar)
        var chartArea = OG_H - 60;
        var scale = Math.min(OG_W / chartW, chartArea / chartH);
        var offsetX = (OG_W - chartW * scale) / 2;
        var offsetY = (chartArea - chartH * scale) / 2;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            ctx.drawImage(c, c.offsetLeft, c.offsetTop);
        }
        ctx.restore();

        // Draw SVG overlay (axis labels, ticks)
        var svgEl = container.querySelector("svg");
        if (svgEl) {
            var svgStr = new XMLSerializer().serializeToString(svgEl);
            var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
                ctx.save();
                ctx.translate(offsetX, offsetY);
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
                URL.revokeObjectURL(url);
                addTitleAndFinish();
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                addTitleAndFinish();
            };
            img.src = url;
        } else {
            addTitleAndFinish();
        }

        function addTitleAndFinish() {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, OG_H - 60, OG_W, 60);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(title, OG_W / 2, OG_H - 30);
            ogCanvas.toBlob(function (b) { callback(b); }, "image/png");
        }
    }

    function shareToWeb() {
        if (rawData.length === 0) {
            showToast(i18n.shareNoData, "error");
            return;
        }

        var sb = getShareSupabase();
        if (!sb) {
            showToast(i18n.shareFailed + "Supabase not loaded", "error");
            return;
        }

        var title = prompt(i18n.shareTitle, i18n.title);
        if (!title) return;

        var chartConfig = getProjectData();

        sb.from("parallel_coordinates_shares")
            .insert({ title: title, chart_config: chartConfig })
            .select("id")
            .single()
            .then(function (result) {
                if (result.error) throw result.error;
                var share = result.data;

                // Upload OG image in background
                generateOgImage(title, function (pngBlob) {
                    if (pngBlob) {
                        sb.storage
                            .from("parallel-coordinates-og-images")
                            .upload(share.id + ".png", pngBlob, {
                                contentType: "image/png",
                                upsert: true
                            });
                    }
                });

                var ogShareUrl = SUPABASE_URL + "/functions/v1/og-parallel-coordinates-share?id=" + share.id;
                showShareModal(ogShareUrl, title);
            })
            .catch(function (err) {
                showToast(i18n.shareFailed + (err.message || err), "error");
            });
    }

    function showShareModal(shareUrl, title) {
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";

        var modal = document.createElement("div");
        modal.style.cssText = "background:#fff;border-radius:12px;padding:24px;max-width:500px;width:90%;text-align:center;";

        var h3 = document.createElement("h3");
        h3.textContent = i18n.shareModalTitle;
        h3.style.cssText = "margin:0 0 16px;font-size:1.1rem;";
        modal.appendChild(h3);

        var urlBox = document.createElement("input");
        urlBox.type = "text";
        urlBox.readOnly = true;
        urlBox.value = shareUrl;
        urlBox.style.cssText = "width:100%;padding:8px 12px;font-size:0.85rem;border:1px solid #ccc;border-radius:6px;margin-bottom:12px;";
        modal.appendChild(urlBox);

        var btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";

        var copyBtn = document.createElement("button");
        copyBtn.textContent = i18n.shareCopyUrl;
        copyBtn.style.cssText = "padding:8px 20px;border:1px solid #ccc;border-radius:6px;background:#e8f4e8;cursor:pointer;font-size:0.9rem;";
        copyBtn.addEventListener("click", function () {
            navigator.clipboard.writeText(shareUrl);
            copyBtn.textContent = i18n.shareCopied;
            setTimeout(function () { copyBtn.textContent = i18n.shareCopyUrl; }, 2000);
        });
        btnRow.appendChild(copyBtn);

        var xBtn = document.createElement("button");
        xBtn.textContent = i18n.shareOnX;
        xBtn.style.cssText = "padding:8px 20px;border:1px solid #333;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:0.9rem;";
        xBtn.addEventListener("click", function () {
            var text = encodeURIComponent(title);
            var url = encodeURIComponent(shareUrl);
            window.open("https://x.com/intent/tweet?text=" + text + "&url=" + url, "_blank");
        });
        btnRow.appendChild(xBtn);

        var closeBtn = document.createElement("button");
        closeBtn.textContent = i18n.shareClose;
        closeBtn.style.cssText = "padding:8px 20px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem;";
        closeBtn.addEventListener("click", function () { overlay.remove(); });
        btnRow.appendChild(closeBtn);

        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function showToast(msg, type) {
        var toolHeader = document.querySelector("dataviz-tool-header");
        if (toolHeader && toolHeader.showMessage) {
            toolHeader.showMessage(msg, type || "success");
        }
    }

    function saveToCloud() {
        if (rawData.length === 0) {
            showToast(i18n.noData, "error");
            return;
        }
        var now = new Date();
        var defaultName = now.getFullYear() + "-"
            + String(now.getMonth() + 1).padStart(2, "0") + "-"
            + String(now.getDate()).padStart(2, "0") + " "
            + String(now.getHours()).padStart(2, "0") + ":"
            + String(now.getMinutes()).padStart(2, "0");
        var name = prompt(i18n.projectName, defaultName);
        if (name === null) return;
        if (!name.trim()) name = defaultName;

        showToast(i18n.saving, "info");

        getAuthToken().then(function (token) {
            generateThumbnail(function (thumbnailDataUrl) {
                var projectData = getProjectData();
                var body = {
                    name: name.trim(),
                    app_name: APP_NAME,
                    data: projectData
                };
                if (thumbnailDataUrl) {
                    body.thumbnail = thumbnailDataUrl;
                }

                var method = "POST";
                var url = API_BASE;
                if (currentProjectId) {
                    method = "PUT";
                    url = API_BASE + "/" + currentProjectId;
                    delete body.app_name;
                }

                fetch(url, {
                    method: method,
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                }).then(function (res) {
                    if (!res.ok) throw new Error(res.status);
                    return res.json();
                }).then(function (result) {
                    if (result.project && result.project.id) {
                        currentProjectId = result.project.id;
                    }
                    showToast(i18n.saved, "success");
                }).catch(function () {
                    showToast(i18n.saveError, "error");
                });
            });
        }).catch(function () {
            showToast(i18n.authRequired, "error");
        });
    }

    function loadFromCloud() {
        showToast(i18n.loading, "info");

        getAuthToken().then(function (token) {
            fetch(API_BASE + "?app=" + APP_NAME, {
                method: "GET",
                headers: { "Authorization": "Bearer " + token }
            }).then(function (res) {
                if (!res.ok) throw new Error(res.status);
                return res.json();
            }).then(function (result) {
                var projects = result.projects || [];
                showProjectModal(projects, token);
            }).catch(function () {
                showToast(i18n.loadError, "error");
            });
        }).catch(function () {
            showToast(i18n.authRequired, "error");
        });
    }

    function loadProjectById(projectId) {
        var toolHeader = document.querySelector("dataviz-tool-header");
        if (toolHeader && toolHeader.showMessage) {
            showToast(i18n.loading, "info");
        }

        getAuthToken().then(function (token) {
            fetch(API_BASE + "/" + projectId, {
                method: "GET",
                headers: { "Authorization": "Bearer " + token }
            }).then(function (res) {
                if (!res.ok) throw new Error(res.status);
                return res.json();
            }).then(function (projectData) {
                currentProjectId = projectId;
                restoreProject(projectData);
                showToast(i18n.loaded, "success");
            }).catch(function () {
                showToast(i18n.loadError, "error");
            });
        }).catch(function () {
            // Not authenticated — try with credentials (cookie)
            fetch("https://auth.dataviz.jp/api/projects/" + projectId, {
                method: "GET",
                credentials: "include",
                headers: { "Content-Type": "application/json" }
            }).then(function (res) {
                if (!res.ok) throw new Error(res.status);
                return res.json();
            }).then(function (projectData) {
                currentProjectId = projectId;
                restoreProject(projectData);
            }).catch(function () {
                showToast(i18n.loadError, "error");
            });
        });
    }

    // ─── Project list modal ───

    function showProjectModal(projects, token) {
        var modal = document.getElementById("project-modal");
        var body = document.getElementById("modal-body");
        document.getElementById("modal-title").textContent = i18n.projects;

        if (projects.length === 0) {
            body.innerHTML = '<div class="project-list-empty">' + escapeHtml(i18n.noProjects) + '</div>';
        } else {
            var html = "";
            projects.forEach(function (p) {
                var date = new Date(p.updated_at || p.created_at);
                var dateStr = date.toLocaleDateString(isJa ? "ja-JP" : "en-US", {
                    year: "numeric", month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit"
                });
                var thumbHtml = '<div class="project-thumbnail project-thumbnail-empty" data-thumb-id="' + escapeHtml(p.id) + '"></div>';
                html += '<div class="project-list-item" data-id="' + escapeHtml(p.id) + '">'
                    + thumbHtml
                    + '<div class="project-info">'
                    + '<span class="project-name">' + escapeHtml(p.name) + '</span>'
                    + '<span class="project-date">' + escapeHtml(dateStr) + '</span>'
                    + '</div>'
                    + '</div>';
            });
            body.innerHTML = html;

            // Load thumbnails asynchronously
            projects.forEach(function (p) {
                if (!p.thumbnail_path) return;
                var el = body.querySelector('[data-thumb-id="' + p.id + '"]');
                if (!el) return;
                fetch(API_BASE + "/" + p.id + "/thumbnail", {
                    method: "GET",
                    headers: { "Authorization": "Bearer " + token }
                }).then(function (res) {
                    if (!res.ok) return null;
                    return res.blob();
                }).then(function (blob) {
                    if (!blob) return;
                    var img = document.createElement("img");
                    img.className = "project-thumbnail";
                    img.src = URL.createObjectURL(blob);
                    img.alt = "";
                    el.replaceWith(img);
                }).catch(function () {});
            });

            body.querySelectorAll(".project-list-item").forEach(function (item) {
                item.addEventListener("click", function () {
                    var id = this.dataset.id;
                    closeModal();
                    showToast(i18n.loading, "info");
                    fetch(API_BASE + "/" + id, {
                        method: "GET",
                        headers: { "Authorization": "Bearer " + token }
                    }).then(function (res) {
                        if (!res.ok) throw new Error(res.status);
                        return res.json();
                    }).then(function (projectData) {
                        currentProjectId = id;
                        restoreProject(projectData);
                        showToast(i18n.loaded, "success");
                    }).catch(function () {
                        showToast(i18n.loadError, "error");
                    });
                });
            });
        }

        modal.style.display = "flex";
    }

    function closeModal() {
        document.getElementById("project-modal").style.display = "none";
    }

    // ─── Chart rendering ───

    function normalizeMinMax(data, keys) {
        keys.forEach(function (key) {
            var vals = data.map(function (r) { return r[key]; }).filter(function (v) { return v !== null; });
            var min = d3.min(vals);
            var max = d3.max(vals);
            var range = max - min;
            data.forEach(function (row) {
                if (row[key] === null) return;
                row[key] = range === 0 ? 0 : +((row[key] - min) / range).toFixed(4);
            });
        });
    }

    function standardizeZScore(data, keys) {
        keys.forEach(function (key) {
            var vals = data.map(function (r) { return r[key]; }).filter(function (v) { return v !== null; });
            var mean = d3.mean(vals);
            var std = Math.sqrt(d3.mean(vals.map(function (v) { return (v - mean) * (v - mean); })));
            data.forEach(function (row) {
                if (row[key] === null) return;
                row[key] = std === 0 ? 0 : +((row[key] - mean) / std).toFixed(4);
            });
        });
    }

    function renderChart(data, dims_keys, brushExtents) {
        var container = document.getElementById("parcoords-chart");
        container.innerHTML = "";

        var dims = {};
        dims_keys.forEach(function (key) {
            dims[key] = {};
        });

        pc = d3.parcoords()("#parcoords-chart")
            .width(chartWidth())
            .height(chartHeight())
            .data(data)
            .dimensions(dims)
            .color("steelblue")
            .alpha(data.length > 500 ? 0.1 : 0.35)
            .margin({ top: 36, left: 10, right: 10, bottom: 16 })
            .render()
            .shadows()
            .alphaOnBrushed(0.15)
            .createAxes()
            .reorderable()
            .brushMode("1D-axes");

        pc.on("brush", function (brushed) {
            updateTable(brushed);
            updateCount(brushed.length, allData.length);
        });

        if (brushExtents && Object.keys(brushExtents).length > 0) {
            pc.brushExtents(brushExtents);
        }
    }

    function chartWidth() {
        var container = document.getElementById("parcoords-chart");
        return container.clientWidth || 960;
    }

    function chartHeight() {
        var container = document.getElementById("parcoords-chart");
        return (container.clientHeight || 400) - 20;
    }

    // ─── Utilities ───

    function coerceNumericFields(data) {
        var keys = Object.keys(data[0]);
        var nKeys = keys.filter(function (key) {
            return data.every(function (row) {
                var v = row[key];
                return v === "" || v === null || v === undefined || !isNaN(+v);
            });
        });

        data.forEach(function (row) {
            nKeys.forEach(function (key) {
                var v = row[key];
                row[key] = (v === "" || v === null || v === undefined) ? null : +v;
            });
        });

        return { data: data, numericKeys: nKeys };
    }

    function dedupHeaders(csvText) {
        var lines = csvText.split("\n");
        if (lines.length === 0) return csvText;
        var headers = lines[0].split(",");
        var seen = {};
        headers = headers.map(function (h) {
            h = h.trim();
            if (seen[h]) {
                var count = seen[h];
                seen[h] = count + 1;
                return h.replace(/(\([^)]*\))$/, String(count + 1) + "$1")
                    || h + "_" + (count + 1);
            }
            seen[h] = 1;
            return h;
        });
        lines[0] = headers.join(",");
        return lines.join("\n");
    }

    function updateTable(data) {
        var thead = document.querySelector("#data-table thead");
        var tbody = document.querySelector("#data-table tbody");

        var headerHtml = "<tr>";
        allKeys.forEach(function (key) {
            headerHtml += "<th>" + escapeHtml(key) + "</th>";
        });
        headerHtml += "</tr>";
        thead.innerHTML = headerHtml;

        var displayData = data.slice(0, 200);
        var bodyHtml = "";
        displayData.forEach(function (row) {
            var dataIdx = allData.indexOf(row);
            bodyHtml += '<tr data-idx="' + dataIdx + '">';
            allKeys.forEach(function (key) {
                var val = row[key];
                bodyHtml += "<td>" + (val === null || val === undefined ? "" : escapeHtml(String(val))) + "</td>";
            });
            bodyHtml += "</tr>";
        });
        tbody.innerHTML = bodyHtml;
    }

    function updateCount(shown, total) {
        var el = document.getElementById("row-count");
        el.textContent = shown + " / " + total + " " + i18n.rows;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
})();
