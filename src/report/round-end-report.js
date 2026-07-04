const metricData = [
  { label: "Budget", value: "£0.0m", delta: "—", deltaClass: "", last: 56, current: 66 },
  { label: "Waiting", value: "68", delta: "+11", deltaClass: "delta-good", last: 38, current: 54 },
  { label: "Pat Sat", value: "63", delta: "-4", deltaClass: "delta-bad", last: 63, current: 59 },
  { label: "Morale", value: "58", delta: "-3", deltaClass: "delta-bad", last: 49, current: 46 },
  { label: "Safety", value: "66", delta: "-6", deltaClass: "delta-bad", last: 68, current: 62 },
  { label: "Rep", value: "60", delta: "+2", deltaClass: "delta-good", last: 41, current: 48 }
];

const decisionOptions = [
  {
    title: "Open Escalation Ward",
    description: "Convert the education suite into a short-stay respiratory ward for six weeks.",
    pros: "Fastest bed capacity gain.",
    cons: "Expensive agency cover.",
    impact: "Waiting list -6, morale -4, safety +7"
  },
  {
    title: "Fund Discharge Hub",
    description: "Deploy senior discharge coordinators and weekend pharmacy cover.",
    pros: "Improves flow without new beds.",
    cons: "Benefit ramps slowly.",
    impact: "Budget -3, waiting list -8, morale +3"
  },
  {
    title: "Pause Electives",
    description: "Protect urgent and infection pathways by cancelling low-risk elective lists.",
    pros: "Immediate operational relief.",
    cons: "Reputational damage.",
    impact: "Safety +8, reputation -7, waiting list +10"
  },
  {
    title: "Community Respiratory Team",
    description: "Commission rapid home monitoring for frail respiratory patients.",
    pros: "Reduces admissions sustainably.",
    cons: "Requires partner alignment.",
    impact: "Budget -4, safety +5, reputation +6"
  }
];

const reportPages = [
  {
    tab: "P1",
    title: "Prior Month Results",
    note: "Headline position against last quarter. Draft text for board pack flavour.",
    bodyClass: "results-layout",
    body: `
      <section class="board-panel chart-panel" aria-label="Board metrics versus last quarter">
        <h3>Board Metrics vs Last Quarter</h3>
        <div class="metric-chart">
          ${metricData.map(metricBar).join("")}
        </div>
        <div class="chart-key" aria-label="Chart key">
          <span><i class="last"></i>Last quarter</span>
          <span><i class="this"></i>This quarter</span>
        </div>
      </section>

      <section class="board-panel commentary" aria-label="Board metric commentary">
        <h3>Commentary Placeholder</h3>
        <p class="commentary-copy">The trust closed the quarter with a mixed but manageable position. Demand continued to rise, but operational grip improved in several pressure areas.</p>
        <p class="commentary-copy">Patient satisfaction softened as waits increased. Staff morale remains the area to watch if escalation beds stay open.</p>
        <div class="metric-list">
          ${metricData.map(metricRow).join("")}
        </div>
      </section>
    `
  },
  {
    tab: "P2",
    title: "Issue at Hand",
    note: "The scenario setup before the C-suite chooses a response.",
    bodyClass: "issue-layout",
    body: `
      <section class="issue-brief" aria-label="Winter pressure issue summary">
        <div class="issue-icon" aria-hidden="true"></div>
        <h3>Winter Demand Spike</h3>
        <p>ED attendances and respiratory admissions have risen faster than expected. Bed occupancy is now running above the planned safe operating range.</p>
        <ul>
          <li>Ambulance handover delays are increasing.</li>
          <li>Elective lists are at risk of cancellation.</li>
          <li>Staff absence is beginning to affect rosters.</li>
        </ul>
        <div class="board-question"><strong>Board question:</strong> how do you protect safety without destroying the budget position?</div>
      </section>

      <section class="board-panel issue-picture" aria-label="Operational infection projection">
        <h3>Operational Picture</h3>
        <div class="infection-chart">
          <span class="projection-line" aria-hidden="true"></span>
          ${infectionBar("M1", 25, false)}
          ${infectionBar("M2", 34, false)}
          ${infectionBar("M3", 45, false)}
          ${infectionBar("Q+1", 60, true)}
          ${infectionBar("Q+2", 75, true)}
          ${infectionBar("Q+3", 88, true)}
        </div>
        <p>Projected infection pressure breaches tolerance if winter demand continues without additional controls, extra discharge grip, or protected staffing cover.</p>
      </section>
    `
  },
  {
    tab: "P3",
    title: "Options",
    note: "Select the board response to carry into the next round.",
    bodyClass: "options-layout",
    body: `
      <p class="options-intro">Each option trades budget, waiting list recovery, safety, morale and reputation. Select one response before resetting or advancing the round.</p>
      <div class="options-grid" aria-label="Decision options">
        ${decisionOptions.map(optionCard).join("")}
      </div>
    `
  }
];

function metricBar(metric) {
  return `
    <div class="bar-group" style="--last: ${metric.last}; --this: ${metric.current}">
      <div class="bars"><span class="bar last-q"></span><span class="bar this-q"></span></div>
      <span class="bar-label">${metric.label}</span>
    </div>
  `;
}

function metricRow(metric) {
  return `
    <div class="metric-row">
      <span>${metric.label}</span>
      <span>${metric.value}</span>
      <span class="${metric.deltaClass}">${metric.delta}</span>
    </div>
  `;
}

function infectionBar(label, height, projected) {
  const projectedClass = projected ? " projected" : "";
  return `<div class="infection-bar${projectedClass}" style="--h: ${height}" data-label="${label}"></div>`;
}

function optionCard(option) {
  return `
    <button class="option-card" type="button" data-option="${option.title}">
      <h3>${option.title}</h3>
      <p>${option.description}</p>
      <ul>
        <li class="pro">Pros: ${option.pros}</li>
        <li class="con">Cons: ${option.cons}</li>
      </ul>
      <div class="impact">Expected impact: ${option.impact}</div>
    </button>
  `;
}

function reportPage(page, index) {
  return `
    <article class="page" data-page="${index}" data-layer="${index}" aria-label="${page.title}">
      <div class="page-tab" data-tab="${page.tab}"></div>
      <div class="page-binder" aria-hidden="true"></div>
      <div class="page-content">
        <header class="report-head">
          <div class="page-badge">Page ${index + 1}</div>
          <div class="title-block">
            <h2>${page.title}</h2>
            <p class="deck-note">${page.note}</p>
          </div>
          <div class="quarter-mark">Q1 / 03</div>
        </header>
        <div class="report-rule" aria-hidden="true"></div>
        <div class="page-body ${page.bodyClass}">${page.body}</div>
      </div>
    </article>
  `;
}

function renderReport() {
  const mount = document.getElementById("roundEndReport");

  mount.innerHTML = `
    <main class="app" id="app">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">N</div>
          <h1>Northbrook General Hospital</h1>
        </div>
        <div class="status"><span class="status-dot"></span><span>Round closed - board decision pending</span></div>
      </header>

      <section class="boardroom" aria-label="Round-end board report">
        <div class="table" aria-hidden="true"></div>
        <div class="stack-wrap">
          <div class="stack-shadow" aria-hidden="true"></div>
          ${reportPages.map(reportPage).join("")}
        </div>
      </section>

      <footer class="footerbar">
        <div class="progress" aria-label="Report page progress">
          ${reportPages.map((_, index) => `<span class="pip${index === 0 ? " active" : ""}"></span>`).join("")}
        </div>
        <div class="footer-tag">Q1 board report pack</div>
        <div class="controls">
          <div class="choice-readout" id="choiceReadout">Decision not recorded</div>
          <button class="nav-button" id="nextBtn" type="button">Next Page</button>
        </div>
      </footer>
    </main>
  `;

  bindReportControls();
}

function bindReportControls() {
  const app = document.getElementById("app");
  const pages = Array.from(document.querySelectorAll(".page"));
  const pips = Array.from(document.querySelectorAll(".pip"));
  const nextBtn = document.getElementById("nextBtn");
  const choiceReadout = document.getElementById("choiceReadout");
  const optionCards = Array.from(document.querySelectorAll(".option-card"));

  let pageIndex = 0;
  let isAnimating = false;

  function updateStack() {
    pages.forEach((page) => {
      const index = Number(page.dataset.page);
      const layer = index - pageIndex;

      page.classList.remove("hidden", "is-exiting");

      if (layer < 0) {
        page.classList.add("hidden");
        page.setAttribute("aria-hidden", "true");
        return;
      }

      page.dataset.layer = String(Math.min(layer, 2));
      page.setAttribute("aria-hidden", layer === 0 ? "false" : "true");
    });

    pips.forEach((pip, index) => {
      pip.classList.toggle("active", index === pageIndex);
    });

    const finalPage = pageIndex === pages.length - 1;
    nextBtn.textContent = finalPage ? "Reset Report" : "Next Page";
    app.classList.toggle("final-mode", finalPage);
  }

  function nextPage() {
    if (isAnimating) return;

    if (pageIndex >= pages.length - 1) {
      resetReport();
      return;
    }

    isAnimating = true;
    pages[pageIndex].classList.add("is-exiting");

    window.setTimeout(() => {
      pageIndex += 1;
      updateStack();
      isAnimating = false;
    }, 610);
  }

  function resetReport() {
    if (isAnimating) return;
    pageIndex = 0;
    optionCards.forEach((card) => card.classList.remove("selected"));
    choiceReadout.textContent = "Decision not recorded";
    updateStack();
  }

  optionCards.forEach((card) => {
    card.addEventListener("click", () => {
      optionCards.forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
      choiceReadout.textContent = `Decision: ${card.dataset.option}`;
    });
  });

  nextBtn.addEventListener("click", nextPage);

  window.addEventListener("keydown", (event) => {
    const tag = document.activeElement.tagName.toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    if (typing) return;

    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      nextPage();
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      resetReport();
    }
  });

  updateStack();
}

renderReport();
