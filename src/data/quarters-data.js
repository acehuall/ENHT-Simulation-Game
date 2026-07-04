'use strict';
/* =========================================================
   QUARTERS DATA — single source of truth for every board
   quarter in the game. The sim, banners, boardroom report,
   graphs and decision outcomes are ALL driven from here.

   HOW TO EDIT:
   - scenario / report text -> label, name, title, scenarioText,
                               page1Summary, page2Issue, reportTone
   - stat impacts           -> options[n].effects   (metric keys below)
   - luck / randomness      -> options[n].riskEvents (chance 0..1,
                               rolled once when the board confirms)
   - the page-2 graph       -> page2GraphType + page2GraphData
                               (renderers: src/report/report-graphs.js)
   - mid-quarter sim drift  -> simEvents (timed effects + toast shown
                               during the 45s simulation, t in seconds)

   METRIC KEYS (ranges live in src/data/scenario-data.js):
     budget  - £m variance vs plan (money, negative = deficit)
     waiting - % of patients met within 18 weeks (higher = better)
     patsat  - patient satisfaction 0-100
     morale  - staff morale 0-100
     safety  - patient safety 0-100 (higher = safer)
     rep     - public reputation 0-100

   ADDING A FUTURE Q5:
     Copy a quarter object, give it a unique id/label/name, write
     its text, 4 options and graph data, and append it to this
     array. Progression, the dev dropdown, banners and the report
     all read QUARTERS.length — nothing else needs touching.
     For a brand-new graph style, add a renderer + case for the
     new page2GraphType in src/report/report-graphs.js.
========================================================= */

var QUARTERS = [

  /* ================= Q1 — THE CORRIDOR CRISIS ================= */
  {
    id: 'q1',
    label: 'Q1',
    name: 'WINTER PRESSURE',
    title: 'The Corridor Crisis',
    reportTone: 'operational crisis',
    scenarioText: 'It is early January and an immense rise in flu cases is hitting the Trust. Bed occupancy is at 97%, staff sickness has left wards understaffed, and corridor care has been reported on four days in the last week.',
    nextQuarterIntro: 'NEXT — Q2 · THE TREASURY DILEMMA: the regulator demands a £12m cost improvement plan by year end.',

    /* timed effects during the 45s simulation (with ticker toasts) */
    simEvents: [
      { t: 8,  name: 'Norovirus outbreak',
        toast: '&#9888; 3 nurses off sick &mdash; norovirus',
        effects: { waiting: -6, patsat: -3, morale: -5, safety: -4, rep: -1 } },
      { t: 18, name: 'Escalation beds open',
        toast: '&#10010; Escalation beds opened &mdash; unfunded',
        effects: { budget: -1.2, waiting: +5, patsat: +2, morale: -2, safety: +2 } },
      { t: 28, name: 'Ward 4 incident',
        toast: '&#9888; Incident reported &mdash; Ward 4',
        effects: { waiting: -2, patsat: -4, morale: -3, safety: -9, rep: -5 } }
    ],

    /* PAGE 1 — quarter summary paragraphs (metrics table is computed live) */
    page1Summary: [
      'The Trust closed the quarter under severe winter pressure. Demand rose through all three months and operational grip weakened once the norovirus outbreak took hold on Ward 4.',
      'Safety is the board’s headline concern following the Ward 4 incident. Escalation beds remain open but unfunded, and morale will worsen if they stay open without cover.'
    ],

    /* PAGE 2 — issue text + graph */
    page2Issue: {
      tag: '⚠ PRIORITY ESCALATION — DECISION REQUIRED TONIGHT',
      title: 'THE CORRIDOR CRISIS',
      paras: [
        'Flu admissions have quadrupled in four weeks and bed occupancy is at 97% — beyond the level at which flow, infection control and safe staffing can be maintained.',
        'Staff sickness is running at three times plan, so the wards that need the most cover have the least. On the current trajectory the hospital is days from formal corridor care.'
      ],
      risk: '⚠ RISK — at 97% occupancy a single bad weekend tips the Trust into corridor care and reportable safety breaches.'
    },
    page2GraphType: 'winterPressure',
    page2GraphData: {
      heading: 'WINTER PRESSURE — LAST 4 WEEKS',
      caption: 'BED OCCUPANCY vs FLU ADMISSIONS vs STAFF SICKNESS · RED DASH = BREAKING POINT',
      periods: ['W1', 'W2', 'W3', 'W4'],
      maxV: 120,
      capacity: { v: 100, label: 'BREAKING POINT' },
      series: [
        { label: 'BED OCC %',   color: '#c98f1d', values: [89, 93, 96, 97] },
        { label: 'FLU ADMITS',  color: '#23c4b4', values: [22, 38, 61, 84] },
        { label: 'STAFF SICK %',color: '#e05252', values: [6, 8, 11, 15] }
      ]
    },

    /* PAGE 3 — the four board options */
    options: [
      {
        id: 'hire_temporary_staff', label: 'A',
        title: 'Hire Temporary Staff',
        description: 'Buy in agency staff to cover sickness and stabilise ward staffing through the peak.',
        pros: ['Patient safety increases', 'More patients met within 18 weeks'],
        cons: ['Large increase in costs'],
        effects: { budget: -1.8, waiting: +5, patsat: +2, morale: +2, safety: +5, rep: +1 },
        riskEvents: [
          { name: 'Temporary staff integrate well', chance: 0.35,
            impacts: { safety: +2, morale: +2 } },
          { name: 'Agency cost overrun', chance: 0.25,
            impacts: { budget: -0.9, rep: -1 } }
        ],
        decisionSummary: 'Agency cover protected safety and flow, but at a serious financial cost.'
      },
      {
        id: 'slow_non_essential_care', label: 'B',
        title: 'Slow Non-Essential Care',
        description: 'Pause lower-priority activity to free staff and beds for urgent winter pressure.',
        pros: ['Improved staff coverage', 'Improved reputation for gripping the crisis'],
        cons: ['Waiting list position worsens'],
        effects: { budget: +0.4, waiting: -7, patsat: -3, morale: +3, safety: +2, rep: +2 },
        riskEvents: [
          { name: 'Backlog makes local headlines', chance: 0.30,
            impacts: { rep: -3, patsat: -2 } }
        ],
        decisionSummary: 'Urgent care was stabilised, but elective patients paid the price on the waiting list.'
      },
      {
        id: 'rapid_discharge', label: 'C',
        title: 'Rapid Discharge',
        description: 'Accelerate discharge planning to free beds faster and improve patient flow.',
        pros: ['Improves patient flow and bed utilisation'],
        cons: ['Could be slow to implement', 'Outcome depends on community capacity'],
        effects: { budget: +0.2, waiting: +3, patsat: -1, morale: -2, safety: -2 },
        riskEvents: [
          { name: 'Discharge scheme stalls in week two', chance: 0.40,
            impacts: { waiting: -4, morale: -2 } },
          { name: 'Community beds found faster than expected', chance: 0.25,
            impacts: { waiting: +3, safety: +2 } }
        ],
        decisionSummary: 'Beds were freed more quickly, but the pressure moved onto discharge teams.'
      },
      {
        id: 'divert_to_other_trusts', label: 'D',
        title: 'Divert to Other Trusts',
        description: 'Divert ambulance flow to neighbouring trusts at peak to reduce immediate pressure.',
        pros: ['Improves staff morale', 'Improves patient safety on site'],
        cons: ['Reputational damage with region and public'],
        effects: { budget: -0.6, waiting: +4, patsat: -2, morale: +3, safety: +3, rep: -4 },
        riskEvents: [
          { name: 'Neighbouring trust complains publicly', chance: 0.30,
            impacts: { rep: -2 } }
        ],
        decisionSummary: 'Pressure on site eased, but the Trust took a reputational hit for leaning on its neighbours.'
      }
    ]
  },

  /* ================= Q2 — THE TREASURY DILEMMA ================= */
  {
    id: 'q2',
    label: 'Q2',
    name: 'COST IMPROVEMENT',
    title: 'The Treasury Dilemma',
    reportTone: 'financial pressure',
    scenarioText: 'Due to financial restraints, the Trust has been asked to deliver a £12 million Cost Improvement Plan by year end. Around 70% of the Trust budget is pay, so meaningful savings are hard to find without touching the workforce.',
    nextQuarterIntro: 'NEXT — Q3 · THE MATERNITY WARD: a serious incident forces the board to confront its own culture.',

    simEvents: [
      { t: 8,  name: 'CIP gap widens',
        toast: '&#9888; CIP tracker &mdash; &pound;4.8m still unidentified',
        effects: { budget: -0.8, morale: -2, rep: -1 } },
      { t: 18, name: 'Vacancy freeze begins',
        toast: '&pound; Vacancy freeze in force',
        effects: { budget: +0.6, waiting: -3, morale: -4, safety: -2 } },
      { t: 28, name: 'Energy tariff rises',
        toast: '&#9888; Energy tariff up 12%',
        effects: { budget: -1.0, rep: -1 } }
    ],

    page1Summary: [
      'The quarter was dominated by the finance position. The Cost Improvement Plan tracker still shows a multi-million unidentified gap, and the vacancy freeze bought savings at the cost of morale and ward cover.',
      'Non-pay pressure worsened with the energy tariff rise. The board must now choose how the £12m is found — every route touches either staff, patients or reputation.'
    ],

    page2Issue: {
      tag: '£ FINANCIAL RECOVERY — CIP DECISION REQUIRED',
      title: 'THE TREASURY DILEMMA',
      paras: [
        'The Trust must find £12m of savings by year end. Only £7.2m has been identified so far, and with 70% of spend in pay, the remaining £4.8m cannot be found without a structural choice.',
        'The regulator has signalled that a credible plan is expected at this meeting. An unfunded gap carried into Q3 would trigger enhanced oversight of the Trust’s spending.'
      ],
      risk: '⚠ RISK — £4.8m of the £12m target is unidentified. No credible plan means escalation to enhanced financial oversight.'
    },
    page2GraphType: 'financeGap',
    page2GraphData: {
      heading: 'CIP WATERFALL — £12M TARGET',
      caption: 'TEAL = IDENTIFIED SAVINGS (CUMULATIVE) · RED = UNIDENTIFIED GAP · AMBER DASH = TARGET',
      unit: '£m',
      target: 12,
      steps: [
        { label: 'PROCURE', v: 1.8 },
        { label: 'AGENCY',  v: 2.6 },
        { label: 'ESTATES', v: 1.2 },
        { label: 'BACK OFC', v: 1.6 }
      ],
      gapLabel: 'GAP'
    },

    options: [
      {
        id: 'increase_private_revenue', label: 'A',
        title: 'Increase Private Revenue',
        description: 'Expand private patient units to generate income from spare estate and theatre time.',
        pros: ['Improved revenue', 'Staff mostly unaffected'],
        cons: ['Ethical / reputational hit', 'Decreased NHS bed capacity'],
        effects: { budget: +2.2, waiting: -3, patsat: -2, rep: -3 },
        riskEvents: [
          { name: 'Private demand exceeds forecast', chance: 0.30,
            impacts: { budget: +1.0 } },
          { name: '"Two-tier care" headlines', chance: 0.25,
            impacts: { rep: -3, patsat: -2 } }
        ],
        decisionSummary: 'Private income eased the deficit, but at a cost to NHS capacity and public trust.'
      },
      {
        id: 'automate_workforce', label: 'B',
        title: 'Automate Workforce Processes',
        description: 'Automate rostering, payroll and admin processes to cut back-office cost.',
        pros: ['Recurring cost saving', 'Time saved for clinical teams'],
        cons: ['Staff unhappy about job security', 'Reputational hit locally'],
        effects: { budget: +1.4, waiting: +2, morale: -4, rep: -2 },
        riskEvents: [
          { name: 'Rollout glitches hit payroll', chance: 0.30,
            impacts: { morale: -3, rep: -1 } },
          { name: 'Automation beds in fast', chance: 0.35,
            impacts: { budget: +0.8, waiting: +2 } }
        ],
        decisionSummary: 'Automation delivered recurring savings, but staff saw it as the thin end of a wedge.'
      },
      {
        id: 'submit_deficit_plan', label: 'C',
        title: 'Submit Deficit Plan',
        description: 'Tell the regulator the target is undeliverable and submit a planned deficit instead.',
        pros: ['No direct staff impact'],
        cons: ['Reduced control of Trust finances', 'Restricts future options'],
        effects: { budget: -1.5, morale: +1, rep: -2 },
        riskEvents: [
          { name: 'Regulator imposes spending controls', chance: 0.40,
            impacts: { budget: -0.5, rep: -2, morale: -2 } }
        ],
        decisionSummary: 'Staff were protected in the short term, but the Trust ceded control over its own finances.'
      },
      {
        id: 'reduce_waste', label: 'D',
        title: 'Reduce Waste',
        description: 'Systematic waste review: procurement, duplication, estates and clinical consumables.',
        pros: ['Better value for money', 'Low direct patient impact'],
        cons: ['Savings may be limited', 'Takes time to identify properly'],
        effects: { budget: +0.9, morale: +1, rep: +1 },
        riskEvents: [
          { name: 'Waste review finds quick wins', chance: 0.35,
            impacts: { budget: +0.8 } },
          { name: 'Savings slower than hoped', chance: 0.35,
            impacts: { budget: -0.6 } }
        ],
        decisionSummary: 'The waste programme was safe and defensible, but nobody believes it closes the whole gap.'
      }
    ]
  },

  /* ================= Q3 — THE MATERNITY WARD ================= */
  {
    id: 'q3',
    label: 'Q3',
    name: 'SAFETY & CULTURE',
    title: 'The Maternity Ward',
    reportTone: 'governance and culture crisis',
    scenarioText: 'A baby in the maternity ward was seriously injured after a failure to escalate concerns to senior staff. Staff say the failure is linked to a culture of bullying — survey scores have declined for five consecutive quarters. The board must decide how to respond.',
    nextQuarterIntro: 'NEXT — Q4 · WAITING LIST PROMISE: a £10m government offer lands on the board table.',

    simEvents: [
      { t: 8,  name: 'Serious incident disclosed',
        toast: '&#9888; Serious incident &mdash; maternity',
        effects: { safety: -8, rep: -4, morale: -3, patsat: -3 } },
      { t: 18, name: 'Staff survey leaks',
        toast: '&#9888; Survey leak &mdash; bullying claims',
        effects: { morale: -5, rep: -3 } },
      { t: 28, name: 'Speak-up reports rise',
        toast: '&#10010; Speak-up reports rising',
        effects: { safety: +3, morale: +2, waiting: -1 } }
    ],

    page1Summary: [
      'This quarter the Trust’s problem was not demand or money — it was itself. The maternity incident exposed an escalation failure, and the leaked staff survey tied it to a culture problem the board can no longer treat as background noise.',
      'Speak-up reporting rose late in the quarter, which is uncomfortable but healthy: staff are saying things they previously kept quiet. What the board does next will decide whether that continues.'
    ],

    page2Issue: {
      tag: '⚠ SERIOUS INCIDENT — GOVERNANCE RESPONSE REQUIRED',
      title: 'THE MATERNITY WARD',
      paras: [
        'A newborn was seriously injured after a midwife’s concerns were not escalated to senior staff. Staff describe a ward where challenging seniors is career-limiting; survey culture scores have fallen five quarters in a row while incident counts rise.',
        'The family has been informed and external review is likely. The board’s response will set the Trust’s safety culture for years — and will be judged in public.'
      ],
      risk: '⚠ RISK — escalation failures are trending up. Without cultural change, the next failure is a matter of time, not chance.'
    },
    page2GraphType: 'cultureSafety',
    page2GraphData: {
      heading: 'CULTURE vs INCIDENTS — 6 QUARTERS',
      caption: 'BARS = INCIDENT REPORTS · LINE = STAFF SURVEY CULTURE SCORE · × = ESCALATION FAILURES',
      periods: ['Q-5', 'Q-4', 'Q-3', 'Q-2', 'Q-1', 'NOW'],
      surveyScore: [74, 71, 69, 65, 61, 56],
      incidents: [4, 5, 7, 8, 11, 14],
      escalationFails: [0, 1, 1, 2, 3, 5],
      maxBar: 16
    },

    options: [
      {
        id: 'immediate_investigation', label: 'A',
        title: 'Immediate Investigation',
        description: 'Commission an immediate independent investigation into the incident and ward culture.',
        pros: ['Improves patient safety', 'Finds root causes'],
        cons: ['Staff morale may dip while under scrutiny', 'Reputation hit if findings leak'],
        effects: { budget: -0.4, patsat: +1, morale: -3, safety: +6, rep: -1 },
        riskEvents: [
          { name: 'Findings leak to the press', chance: 0.30,
            impacts: { rep: -3 } },
          { name: 'Root cause fixed quickly', chance: 0.35,
            impacts: { safety: +3, morale: +2 } }
        ],
        decisionSummary: 'The investigation was uncomfortable, but it put patient safety above the Trust’s image.'
      },
      {
        id: 'add_remedy_procedures', label: 'B',
        title: 'Add Remedy Procedures',
        description: 'Introduce mandatory escalation checklists, second-opinion rules and audit trails.',
        pros: ['Decreased negligence and insurance risk', 'Improved patient safety'],
        cons: ['Slower clinical processes', 'Staff may feel more monitored'],
        effects: { budget: -0.3, waiting: -2, morale: -2, safety: +4, rep: +1 },
        riskEvents: [
          { name: 'Staff feel surveilled, not supported', chance: 0.30,
            impacts: { morale: -3 } }
        ],
        decisionSummary: 'New procedures hard-wired escalation, though some staff read them as mistrust.'
      },
      {
        id: 'issue_public_apology', label: 'C',
        title: 'Issue Public Apology',
        description: 'Publicly apologise to the family, publish the facts and commit to open reporting.',
        pros: ['Improves staff openness and reporting', 'Shows transparency'],
        cons: ['Reputation decreases in the short term'],
        effects: { patsat: +2, morale: +3, safety: +2, rep: -3 },
        riskEvents: [
          { name: 'Openness praised nationally', chance: 0.35,
            impacts: { rep: +4, morale: +2 } }
        ],
        decisionSummary: 'The apology hurt in the headlines, but told staff the truth is safe to speak here.'
      },
      {
        id: 'executive_resignation', label: 'D',
        title: 'Executive Resignation',
        description: 'A board-level executive steps down to take accountability for the failure.',
        pros: ['Reputation may recover through visible accountability'],
        cons: ['Someone has to step down', 'Leadership instability'],
        effects: { morale: -4, rep: +3 },
        riskEvents: [
          { name: 'Interim leadership drifts', chance: 0.40,
            impacts: { budget: -0.4, waiting: -2, morale: -2 } },
          { name: 'Fresh leadership energises the Trust', chance: 0.25,
            impacts: { morale: +4, rep: +2 } }
        ],
        decisionSummary: 'Accountability was seen to be taken — but the Trust now sails a quarter without a full bridge.'
      }
    ]
  },

  /* ================= Q4 — WAITING LIST PROMISE ================= */
  {
    id: 'q4',
    label: 'Q4',
    name: 'WAITING LIST PROMISE',
    title: 'The Waiting List Promise',
    reportTone: 'strategic opportunity',
    scenarioText: 'Under a national elective recovery initiative, the Trust has been offered £10 million to reduce waiting lists — the largest allocation in the county. The money comes with expectations: visible progress on the 18-week target by year end.',
    nextQuarterIntro: 'The financial year closes after this decision — the board’s four choices become the Trust’s story.',

    simEvents: [
      { t: 8,  name: 'Funding confirmed',
        toast: '&pound; &pound;10m elective funding confirmed',
        effects: { budget: +1.2, rep: +2, morale: +1 } },
      { t: 18, name: 'List validation',
        toast: '&#10010; List validation removes duplicates',
        effects: { waiting: +4, patsat: +1 } },
      { t: 28, name: 'Referrals rise',
        toast: '&#9888; Referrals rise ahead of winter',
        effects: { waiting: -5, morale: -2 } }
    ],

    page1Summary: [
      'The quarter opened with rare good news: a £10m elective recovery allocation, the largest in the county. Validation cleaned the waiting list, but rising referrals ahead of winter are already eating into the gain.',
      'The board’s final decision of the year is how to spend the promise — bank it, automate with it, share it, or bet it on research. Each path writes a different ending to the year.'
    ],

    page2Issue: {
      tag: '£ STRATEGIC ALLOCATION — £10M — FINAL DECISION OF THE YEAR',
      title: 'THE WAITING LIST PROMISE',
      paras: [
        'The backlog has grown for six consecutive months and 18-week performance is drifting away from target. Without intervention the forecast keeps climbing into next winter.',
        'Deployed well, £10m bends the curve back towards target. Deployed cynically, it becomes a one-off windfall the public was promised as an operation list.'
      ],
      risk: '⚠ RISK — the do-nothing forecast keeps climbing. The funding is conditional on visible 18-week progress by year end.'
    },
    page2GraphType: 'waitingFunding',
    page2GraphData: {
      heading: 'WAITING LIST BACKLOG — FORECAST (000s)',
      caption: 'SOLID = ACTUAL BACKLOG · TEAL DOTS = WITH £10M · RED DOTS = DO NOTHING · AMBER DASH = TARGET',
      maxV: 15,
      actual: [8.2, 8.6, 9.1, 9.5, 10.2, 10.8],
      invest: [10.4, 9.8, 9.0, 8.1, 7.2, 6.4],
      noFunding: [11.3, 11.9, 12.4, 12.8, 13.1, 13.4],
      target: { v: 7.5, label: 'TARGET' }
    },

    options: [
      {
        id: 'keep_as_savings', label: 'A',
        title: 'Keep as Savings',
        description: 'Bank the allocation against the deficit and strengthen the year-end position.',
        pros: ['Large financial windfall', 'Repairs the budget position'],
        cons: ['Staff upset at the missed chance', 'No improvement in waiting lists'],
        effects: { budget: +3.0, patsat: -2, morale: -4, rep: -2 },
        riskEvents: [
          { name: 'Funding clawback threatened', chance: 0.30,
            impacts: { budget: -1.0, rep: -2 } }
        ],
        decisionSummary: 'The books look healthier — but everyone knows what the money was for.'
      },
      {
        id: 'process_automation', label: 'B',
        title: 'Improve Process Automation',
        description: 'Invest in booking, triage and pathway automation to move patients through faster.',
        pros: ['Staff morale increases', 'More patients met within 18 weeks'],
        cons: ['Reduced manual checking', 'Patient safety risk if validation slips'],
        effects: { budget: +0.5, waiting: +6, patsat: +1, morale: +3, safety: -3 },
        riskEvents: [
          { name: 'Automated validation misses cases', chance: 0.30,
            impacts: { safety: -3, rep: -2 } },
          { name: 'Pathway automation excels', chance: 0.30,
            impacts: { waiting: +3, patsat: +2 } }
        ],
        decisionSummary: 'The machinery of the waiting list got faster — the board must watch what it no longer checks by hand.'
      },
      {
        id: 'partner_with_trusts', label: 'C',
        title: 'Partner With Trusts',
        description: 'Buy capacity from neighbouring trusts, with shared transport and data flows.',
        pros: ['Patient satisfaction improves', 'More patients met within 18 weeks', 'Better transport and data sharing'],
        cons: ['Paying other trusts’ costs', 'Less direct control of the pathway'],
        effects: { budget: -0.8, waiting: +7, patsat: +3, safety: +1, rep: +1 },
        riskEvents: [
          { name: 'Partner trust overruns costs', chance: 0.30,
            impacts: { budget: -0.8 } },
          { name: 'Shared pathway wins national praise', chance: 0.20,
            impacts: { rep: +3 } }
        ],
        decisionSummary: 'Patients moved faster across the county — at the price of writing cheques to the neighbours.'
      },
      {
        id: 'research_funding', label: 'D',
        title: 'Research Funding',
        description: 'Commit the allocation to clinical research partnerships and trial capacity.',
        pros: ['Potential breakthrough therapies', 'Satisfaction and reputation could climb'],
        cons: ['All funding spent', 'Takes time', 'Little short-term waiting list impact'],
        effects: { waiting: -2, patsat: +2, morale: +2, safety: +1, rep: +3 },
        riskEvents: [
          { name: 'Early trial breakthrough', chance: 0.20,
            impacts: { rep: +4, patsat: +3 } },
          { name: 'Programme delays announced', chance: 0.35,
            impacts: { rep: -2 } }
        ],
        decisionSummary: 'The board bet the promise on the future — history will decide if that was vision or vanity.'
      }
    ]
  }
];
