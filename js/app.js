(function () {
    "use strict";

    var APP_NAME = "parallel-coordinates";
    var PUBLIC_SHARE_ORIGIN = "https://parallel-coordinates.dataviz.jp";
    var SUPABASE_URL = "https://vebhoeiltxspsurqoxvl.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_sAjwbAhC0jnIRjNa34QuTA_CcksMYQG";
    var shareSupabase = null;

    // Schema-driven settings persistence (see settings-compat.v1.js)
    var SETTINGS_SPEC = {
        version: 1,
        chartType: "parallel-coordinates",
        fields: {
            scaleMode:    { type: "enum",   default: "original", values: ["original", "normalize", "standardize"] },
            axisOrder:    { type: "array",  default: [], itemType: "string" },
            brushExtents: { type: "object", default: {} }
        },
        migrations: []
    };

    var pc = null;
    var allData = [];
    var rawData = [];
    var allKeys = [];
    var numericKeys = [];
    var currentProjectId = null;
    var lastLoadedName = "";

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
        noData: isJa ? "データがありません" : "No data loaded",
        shareRequiresSavedProject: isJa ? "シェアする前にプロジェクトを保存してください" : "Save the project before sharing.",
        processingProjectList: isJa ? "プロジェクト一覧を読み込み中です" : "Loading project list...",
        processingProjectLoad: isJa ? "プロジェクトを読み込み中です" : "Loading project...",
        processingProjectSave: isJa ? "プロジェクトを保存中です" : "Saving project...",
        processingSavePrep: isJa ? "保存準備中です" : "Preparing save...",
        processingShare: isJa ? "シェアを作成中です" : "Creating share...",
        processingFile: isJa ? "ファイルを読み込み中です" : "Reading file...",
        processingExport: isJa ? "書き出し中です" : "Exporting..."
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
            installHeaderProcessingToasts(toolHeader);
            toolHeader.setConfig({
                logo: { type: "text", text: "Parallel Coordinates" },
                buttons: [
                    { label: isJa ? "プロジェクトの読込" : "Load Project", action: function () { toolHeader.showLoadModal(); }, align: "right" },
                    { label: isJa ? "プロジェクトの保存" : "Save Project", action: function () {
                        showProcessingToast(i18n.processingSavePrep);
                        buildSavePayload().then(function (payload) {
                            if (!payload || !payload.data) {
                                toolHeader.showMessage(i18n.noData, "error");
                                return;
                            }
                            toolHeader.showSaveModal(payload);
                        });
                    }, align: "right" },
                    { label: isJa ? "シェア" : "Share", action: requestShare, align: "right" }
                ]
            });

            toolHeader.setProjectConfig({
                appName: APP_NAME,
                onProjectLoad: function (projectData, meta) {
                    if (meta && meta.isGroupProject) {
                        currentProjectId = null;
                    } else if (meta && meta.projectId) {
                        currentProjectId = meta.projectId;
                        if (meta.projectName) lastLoadedName = meta.projectName;
                    }
                    restoreProject(projectData);
                },
                onProjectSave: function (meta) {
                    currentProjectId = meta.id;
                    lastLoadedName = meta.name;
                },
                onProjectDelete: function (projectId) {
                    if (currentProjectId === projectId) {
                        currentProjectId = null;
                    }
                }
            });

            if (typeof toolHeader.setShareConfig === "function") {
                toolHeader.setShareConfig({
                    getSavePayload: buildSavePayload,
                    getShareTitle: getShareTitle,
                    publishShare: publishShareForHeader,
                    afterPublish: afterPublishShare
                });
            }

            // Sample data picker integration
            toolHeader.setSampleConfig({
                toolId: APP_NAME,
                onSampleSelect: function (detail) {
                    showProcessingToast(isJa ? "サンプルデータを読み込み中です" : "Loading sample data...");
                    fetch(detail.url)
                        .then(function (res) { return res.text(); })
                        .then(function (text) {
                            var parsed = d3.csv.parse(dedupHeaders(text));
                            lastLoadedName = detail.name || "";
                            loadData(parsed);
                        });
                }
            });
        }

        // Sample data button removed — replaced by dataviz-sample-picker in tool header
        var sampleBtn = document.getElementById("load-sample");
        if (sampleBtn) sampleBtn.style.display = "none";

        // CSV upload
        document.getElementById("file-input").addEventListener("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            showProcessingToast(i18n.processingFile);
            lastLoadedName = file.name.replace(/\.[^.]+$/, "");
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
            showProcessingToast(i18n.processingExport);
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
            showProcessingToast(i18n.processingExport);
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
            showProcessingToast(i18n.processingExport);
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

        // Resize
        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (!pc) return;
                pc.width(chartWidth()).height(chartHeight()).render();
            }, 200);
        });

        // Auto-load from URL parameter ?projectId= (takes priority) or ?data_url=
        var params = new URLSearchParams(window.location.search);
        var projectId = params.get("projectId");
        var dataUrl = params.get("data_url");
        if (projectId && toolHeader) {
            toolHeader.loadProject(projectId).then(function (projectData) {
                currentProjectId = projectId;
                restoreProject(projectData);
            });
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (dataUrl) {
            fetch(dataUrl)
                .then(function (res) { return res.text(); })
                .then(function (text) {
                    var parsed = d3.csv.parse(dedupHeaders(text));
                    lastLoadedName = dataUrl.split("/").pop().replace(/\.[^.]+$/, "");
                    loadData(parsed);
                });
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

    function getProjectData() {
        var payload = DVZSettingsCompat.build(SETTINGS_SPEC, {
            data: rawData,
            settings: {
                scaleMode: document.getElementById("scale-mode").value,
                axisOrder: pc ? Object.keys(pc.dimensions()) : numericKeys,
                brushExtents: pc ? pc.brushExtents() : {}
            }
        });
        // allKeys / numericKeys are data metadata (not user settings) — keep them at the top level.
        payload.allKeys = allKeys;
        payload.numericKeys = numericKeys;
        return payload;
    }

    function restoreProject(project) {
        if (!project || !project.data || !project.allKeys) return;
        var normalized = DVZSettingsCompat.normalize(project, SETTINGS_SPEC);
        allKeys = normalized.allKeys || project.allKeys;
        numericKeys = normalized.numericKeys || project.numericKeys || [];
        rawData = normalized.data;
        var s = normalized.settings;
        document.getElementById("scale-mode").value = s.scaleMode;
        applyScaleAndRender(s.axisOrder.length ? s.axisOrder : undefined, s.brushExtents);
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

    function buildSavePayload() {
        if (rawData.length === 0) {
            return Promise.resolve(null);
        }
        return new Promise(function (resolve) {
            generateThumbnail(function (thumbnailDataUri) {
                resolve({
                    name: lastLoadedName || "",
                    data: getProjectData(),
                    thumbnailDataUri: thumbnailDataUri,
                    existingProjectId: currentProjectId
                });
            });
        });
    }

    function getShareTitle() {
        return lastLoadedName || i18n.title;
    }

    // ─── Share to web ───

    function getShareSupabase() {
        if (!shareSupabase && window.supabase) {
            shareSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return shareSupabase;
    }

    async function getDatavizAccessToken() {
        var sb = window.datavizSupabase;
        if (!sb || !sb.auth) return null;
        var result = await sb.auth.getSession();
        return (result && result.data && result.data.session && result.data.session.access_token) || null;
    }

    function publishShareErrorMessage(payload, status) {
        var err = payload && payload.error;
        if (typeof err === "string" && err) return err;
        if (err && typeof err === "object" && err.message) return String(err.message);
        if (payload && payload.message) return String(payload.message);
        return "Share publish failed (" + status + ")";
    }

    async function publishShareFromProject(projectId, fallbackTitle) {
        var accessToken = await getDatavizAccessToken();
        if (!accessToken) throw new Error("Login required");

        var response = await fetch(SUPABASE_URL + "/functions/v1/publish-parallel-coordinates-share", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Dataviz-Authorization": "Bearer " + accessToken
            },
            body: JSON.stringify({
                projectId: projectId,
                fallbackTitle: fallbackTitle || null
            })
        });

        var payload = await response.json().catch(function () { return null; });
        if (!response.ok) {
            throw new Error(publishShareErrorMessage(payload, response.status));
        }
        return payload || {};
    }

    function escapeHtmlAttr(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function buildPublicSharePageUrl(shareId) {
        return "https://parallel-coordinates.dataviz.jp/share.html?id=" + encodeURIComponent(shareId);
    }

    function buildOgShareUrl(shareId) {
        return SUPABASE_URL + "/functions/v1/og-parallel-coordinates-share?id=" + encodeURIComponent(shareId);
    }

    function buildIframeEmbedCode(shareId, rawTitle) {
        var title = escapeHtmlAttr(rawTitle || i18n.title);
        var src = buildPublicSharePageUrl(shareId) + "&embed=1";
        return '<iframe title="' + title + '" src="' + src + '" frameborder="0" scrolling="auto" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen="true" style="display:block;width:100%;max-width:100%;height:auto;aspect-ratio:16/10;border:0;"></iframe>';
    }

    function requestShare() {
        if (rawData.length === 0) {
            showToast(i18n.noData, "error");
            return;
        }
        var header = document.querySelector("dataviz-tool-header");
        if (header && typeof header.shareProject === "function") {
            header.shareProject();
        }
    }

    function publishShareForHeader(args) {
        args = args || {};
        var projectId = String(args.projectId || "").trim();
        if (!projectId) {
            return Promise.reject(new Error(i18n.shareRequiresSavedProject));
        }
        var title = String(args.title || getShareTitle() || "").trim() || i18n.title;
        showProcessingToast(i18n.processingShare);
        return publishShareFromProject(projectId, title).then(function (result) {
            var shareId = result && (result.shareId || result.id);
            if (!shareId) throw new Error("No share ID returned");
            var shareTitle = (result && result.title) || title;
            return {
                shareId: shareId,
                shareUrl: buildOgShareUrl(shareId),
                iframeCode: buildIframeEmbedCode(shareId, shareTitle)
            };
        });
    }

    function afterPublishShare(args) {
        var shareId = args && args.shareId;
        if (!shareId) return;
        var title = (args && args.title) || getShareTitle();
        generateOgImage(title, function (pngBlob) {
            var sb = getShareSupabase();
            if (!pngBlob || !sb) return;
            sb.storage
                .from("parallel-coordinates-og-images")
                .upload(shareId + ".png", pngBlob, {
                    contentType: "image/png",
                    upsert: true
                });
        });
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

    function showToast(msg, type, duration) {
        var toolHeader = document.querySelector("dataviz-tool-header");
        if (toolHeader && toolHeader.showMessage) {
            toolHeader.showMessage(msg, type || "success", duration);
        }
    }

    function showProcessingToast(msg) {
        showToast(msg, "info", 5000);
    }

    function installHeaderProcessingToasts(header) {
        if (!header || header.__dvzNativeProjectProcessingToasts === "1" || header.__dvzProcessingToastsInstalled === "1") return;

        if (typeof header.showLoadModal === "function") {
            var originalShowLoadModal = header.showLoadModal.bind(header);
            header.showLoadModal = function () {
                showProcessingToast(i18n.processingProjectList);
                return originalShowLoadModal.apply(header, arguments);
            };
        }

        if (typeof header.loadProject === "function") {
            var originalLoadProject = header.loadProject.bind(header);
            header.loadProject = function () {
                showProcessingToast(i18n.processingProjectLoad);
                return originalLoadProject.apply(header, arguments);
            };
        }

        if (typeof header.saveProject === "function") {
            var originalSaveProject = header.saveProject.bind(header);
            header.saveProject = function () {
                showProcessingToast(i18n.processingProjectSave);
                return originalSaveProject.apply(header, arguments);
            };
        }

        header.__dvzProcessingToastsInstalled = "1";
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
