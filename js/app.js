(function () {
    "use strict";

    var APP_NAME = "parallel-coordinates";
    var API_BASE = "https://api.dataviz.jp/api/projects";

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
        authRequired: isJa ? "ログインが必要です" : "Login required"
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
                var text = event.target.result;
                var parsed = d3.csv.parse(dedupHeaders(text));
                loadData(parsed);
            };
            reader.readAsText(file);
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

        // Export SVG
        document.getElementById("export-svg").addEventListener("click", function () {
            var container = document.getElementById("parcoords-chart");
            var canvases = container.querySelectorAll("canvas");
            var svgEl = container.querySelector("svg");
            var w = container.clientWidth;
            var h = container.clientHeight;

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
                var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
                img.setAttribute("x", canvas.offsetLeft);
                img.setAttribute("y", canvas.offsetTop);
                img.setAttribute("width", canvas.width);
                img.setAttribute("height", canvas.height);
                img.setAttributeNS("http://www.w3.org/1999/xlink", "href", canvas.toDataURL("image/png"));
                svg.appendChild(img);
            }

            if (svgEl) {
                var clone = svgEl.cloneNode(true);
                var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.setAttribute("transform", "translate(" + svgEl.getBoundingClientRect().left + "," + 0 + ")");
                while (clone.childNodes.length > 0) {
                    g.appendChild(clone.childNodes[0]);
                }
                svg.appendChild(g);
            }

            var serializer = new XMLSerializer();
            var svgStr = serializer.serializeToString(svg);
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

            var offscreen = document.createElement("canvas");
            offscreen.width = w;
            offscreen.height = h;
            var ctx = offscreen.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);

            for (var i = 0; i < canvases.length; i++) {
                var canvas = canvases[i];
                ctx.drawImage(canvas, canvas.offsetLeft, canvas.offsetTop);
            }

            if (svgEl) {
                var serializer = new XMLSerializer();
                var svgStr = serializer.serializeToString(svgEl);
                var svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
                var svgUrl = URL.createObjectURL(svgBlob);
                var img = new Image();
                img.onload = function () {
                    ctx.drawImage(img, 0, 0);
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
        var name = prompt(i18n.projectName, "");
        if (name === null) return;
        if (!name.trim()) name = "Untitled";

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
                html += '<div class="project-list-item" data-id="' + escapeHtml(p.id) + '">'
                    + '<span class="project-name">' + escapeHtml(p.name) + '</span>'
                    + '<span class="project-date">' + escapeHtml(dateStr) + '</span>'
                    + '</div>';
            });
            body.innerHTML = html;

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
