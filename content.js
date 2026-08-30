(() => {
  if (window.__chartOverlayLoaded) return;
  window.__chartOverlayLoaded = true;

  let panel;
  let canvas;
  let ctx;
  let timer = null;

  const intervalMs = 2500;

  function createPanel() {
    panel = document.createElement("div");
    panel.id = "ca-panel";

    panel.innerHTML = `
      <div class="ca-head">
        <strong>Chart Analyzer</strong>
        <button id="ca-close">×</button>
      </div>

      <div class="ca-row">
        <button id="ca-start">Start</button>
        <button id="ca-once">Analyze Now</button>
      </div>

      <div class="ca-status" id="ca-status">Idle</div>

      <div class="ca-card">
        <div>
          <span>Trend</span>
          <b id="ca-trend">—</b>
        </div>

        <div>
          <span>Momentum</span>
          <b id="ca-momentum">—</b>
        </div>

        <div>
          <span>Volatility</span>
          <b id="ca-volatility">—</b>
        </div>

        <div>
          <span>Setup Quality</span>
          <b id="ca-quality">—</b>
        </div>
      </div>

      <label class="ca-check">
        <input type="checkbox" id="ca-paper">
        Paper Mode
      </label>

      <div id="ca-paperbox" class="ca-paperbox hidden">
        <div class="ca-paper-label">
          SIMULATED SIGNAL
        </div>

        <div id="ca-signal" class="ca-signal">
          WAIT
        </div>

        <small id="ca-confidence">
          Confidence: —
        </small>
      </div>

      <div class="ca-note">
        Local heuristic analysis only.
        It does not place trades automatically.
      </div>
    `;

    document.documentElement.appendChild(panel);

    canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 260;
    canvas.style.display = "none";

    panel.appendChild(canvas);

    ctx = canvas.getContext("2d", {
      willReadFrequently: true
    });

    panel.querySelector("#ca-close").onclick = () => {
      panel.classList.add("hidden");
    };

    panel.querySelector("#ca-once").onclick = analyzeOnce;

    panel.querySelector("#ca-start").onclick = toggleRun;

    panel.querySelector("#ca-paper").onchange = (e) => {
      panel
        .querySelector("#ca-paperbox")
        .classList.toggle("hidden", !e.target.checked);
    };
  }

  function setStatus(text) {
    panel.querySelector("#ca-status").textContent = text;
  }

  function toggleRun() {
    const button = panel.querySelector("#ca-start");

    if (timer) {
      clearInterval(timer);
      timer = null;

      button.textContent = "Start";
      setStatus("Stopped");

      return;
    }

    analyzeOnce();

    timer = setInterval(() => {
      analyzeOnce();
    }, intervalMs);

    button.textContent = "Stop";
    setStatus("Running...");
  }

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "CAPTURE_VISIBLE"
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          if (!response?.ok || !response.dataUrl) {
            reject(
              new Error(
                response?.error || "Capture failed"
              )
            );
            return;
          }

          resolve(response.dataUrl);
        }
      );
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = reject;

      img.src = src;
    });
  }

  function analyzePixels(img) {
    const width = img.width;
    const height = img.height;

    /*
      Current crop:
      center 70% width
      around 72% height

      This should cover the main chart
      in most layouts.
    */

    const sx = Math.floor(width * 0.15);
    const sy = Math.floor(height * 0.12);

    const sw = Math.floor(width * 0.70);
    const sh = Math.floor(height * 0.72);

    canvas.width = 480;
    canvas.height = 260;

    ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const pixels = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

    const points = [];

    for (
      let x = 0;
      x < canvas.width;
      x += 4
    ) {
      let weightedY = 0;
      let weight = 0;

      for (
        let y = 2;
        y < canvas.height - 2;
        y += 3
      ) {
        const i =
          (y * canvas.width + x) * 4;

        const j =
          ((y - 2) * canvas.width + x) * 4;

        const lum =
          0.2126 * pixels[i] +
          0.7152 * pixels[i + 1] +
          0.0722 * pixels[i + 2];

        const prevLum =
          0.2126 * pixels[j] +
          0.7152 * pixels[j + 1] +
          0.0722 * pixels[j + 2];

        const difference =
          Math.abs(lum - prevLum);

        if (difference > 25) {
          weightedY += y * difference;
          weight += difference;
        }
      }

      if (weight > 0) {
        points.push([
          x,
          weightedY / weight,
          weight
        ]);
      }
    }

    if (points.length < 20) {
      return {
        trend: "Neutral",
        momentum: "Low",
        volatility: "Low",
        quality: 20,
        shift: 0
      };
    }

    /*
      Compare older chart area
      with newer chart area.

      Screen Y increases downward.

      So:
      shift negative = price visually moving up
      shift positive = price visually moving down
    */

    const n = points.length;

    const older = points.slice(
      Math.floor(n * 0.20),
      Math.floor(n * 0.45)
    );

    const recent = points.slice(
      Math.floor(n * 0.65),
      Math.floor(n * 0.95)
    );

    const averageY = (arr) => {
      return (
        arr.reduce(
          (sum, point) => sum + point[1],
          0
        ) /
        Math.max(arr.length, 1)
      );
    };

    const oldY = averageY(older);
    const newY = averageY(recent);

    const shift = newY - oldY;

    let trend = "Neutral";

    if (shift < -7) {
      trend = "Bullish";
    }

    if (shift > 7) {
      trend = "Bearish";
    }

    const magnitude =
      Math.abs(shift);

    let momentum = "Low";

    if (magnitude > 22) {
      momentum = "High";
    } else if (magnitude > 10) {
      momentum = "Medium";
    }

    /*
      Volatility estimation
      based on movement variation.
    */

    const differences = [];

    for (
      let i = 1;
      i < points.length;
      i++
    ) {
      differences.push(
        Math.abs(
          points[i][1] -
          points[i - 1][1]
        )
      );
    }

    const averageDifference =
      differences.reduce(
        (a, b) => a + b,
        0
      ) /
      Math.max(
        differences.length,
        1
      );

    let volatility = "Low";

    if (averageDifference > 13) {
      volatility = "High";
    } else if (averageDifference > 7) {
      volatility = "Medium";
    }

    /*
      Setup Quality
    */

    let quality =
      35 +
      Math.min(
        35,
        magnitude * 1.4
      );

    if (trend === "Neutral") {
      quality -= 15;
    }

    if (volatility === "High") {
      quality -= 8;
    }

    quality = Math.round(
      Math.max(
        10,
        Math.min(
          quality,
          85
        )
      )
    );

    return {
      trend,
      momentum,
      volatility,
      quality,
      shift
    };
  }

  function getPaperSignal(result) {
    /*
      Conservative filtering.

      Weak setup = WAIT
      High volatility = WAIT
    */

    if (
      result.quality < 58 ||
      result.trend === "Neutral" ||
      result.volatility === "High"
    ) {
      return {
        signal: "WAIT",
        confidence: result.quality
      };
    }

    if (
      result.trend === "Bullish"
    ) {
      return {
        signal: "UP",
        confidence: result.quality
      };
    }

    if (
      result.trend === "Bearish"
    ) {
      return {
        signal: "DOWN",
        confidence: result.quality
      };
    }

    return {
      signal: "WAIT",
      confidence: result.quality
    };
  }

  async function analyzeOnce() {
    try {
      setStatus(
        "Analyzing current chart..."
      );

      const screenshot =
        await captureVisibleTab();

      const img =
        await loadImage(screenshot);

      const result =
        analyzePixels(img);

      panel.querySelector(
        "#ca-trend"
      ).textContent =
        result.trend;

      panel.querySelector(
        "#ca-momentum"
      ).textContent =
        result.momentum;

      panel.querySelector(
        "#ca-volatility"
      ).textContent =
        result.volatility;

      panel.querySelector(
        "#ca-quality"
      ).textContent =
        result.quality + "%";

      const paper =
        getPaperSignal(result);

      panel.querySelector(
        "#ca-signal"
      ).textContent =
        paper.signal;

      panel.querySelector(
        "#ca-confidence"
      ).textContent =
        "Confidence: " +
        paper.confidence +
        "%";

      setStatus(
        "Updated: " +
        new Date().toLocaleTimeString()
      );

    } catch (error) {
      setStatus(
        "Error: " +
        (
          error?.message ||
          error
        )
      );
    }
  }

  chrome.runtime.onMessage.addListener(
    (msg) => {
      if (
        msg?.type ===
        "TOGGLE_PANEL"
      ) {
        if (!panel) {
          createPanel();
        }

        panel.classList.toggle(
          "hidden"
        );
      }
    }
  );

  createPanel();
})();
