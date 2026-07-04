'use strict';
/* ---------- quarterly board decision data ---------- */
/* effects keys match METRIC_DEFS in scenario-data.js; the report overlay
   (src/report/round-end-report.js) renders summary/issue/options and applies
   the chosen option's effects to GAME.stats + the metrics engine baselines */
var QUARTERS = [
  {
    code: 'Q1',
    name: 'WINTER PRESSURE',
    title: 'The Corridor Crisis',
    scenario: 'It is early January and there has been an immense rise in flu cases impacting the Trust. Bed occupancy is at 97%. Several staff are off sick, and wards are understaffed. The board must decide how to respond before corridor care, safety incidents and public criticism worsen.',

    /* page 1 — executive summary paragraphs */
    summary: [
      'Demand rose through all three months of the quarter. A norovirus outbreak closed two bays on Ward 4, staff sickness ran well above plan and agency cover had to be bought in mid-quarter to hold the rotas together.',
      'The Ward 4 incident in Month 3 is the board’s headline concern: safety and reputation both closed the quarter down, and morale remains fragile heading into the winter peak.'
    ],

    /* page 2 — escalation paper */
    issue: {
      tag: '⚠ PRIORITY ESCALATION — DECISION REQUIRED TONIGHT',
      title: 'THE CORRIDOR CRISIS',
      paras: [
        'It is early January and flu admissions are climbing sharply. Bed occupancy is at 97%, well above the 92% safe operating ceiling, and corridor care was reported on four days last week.',
        'Staff sickness is running at three times plan and several wards are operating below planned nursing cover. The emergency department is missing the 4-hour standard on most days.',
        'The board is asked to agree ONE response before the meeting closes. Doing nothing is itself a decision: on the current trajectory, weekly admissions cross funded bed capacity within six weeks.'
      ],
      risk: '⚠ RISK — projected flu admissions breach funded bed capacity (100 / wk) on the do-nothing trajectory.',
      chartTitle: 'FLU ADMISSIONS — ACTUAL VS PROJECTED',
      chartCaption: 'SOLID = ADMISSIONS / WK · DOTTED = DO-NOTHING PROJECTION',
      chart: {
        actual: [22, 27, 33, 41, 50, 61],
        projected: [72, 84, 96, 108, 118, 126],
        capacity: 100, maxV: 140
      }
    },

    /* page 3 — options for decision */
    options: [
      {
        id: 'hire_temporary_staff',
        label: 'A',
        title: 'Hire Temporary Staff',
        description: 'Buy in agency nurses and locum doctors to cover sickness and stabilise ward staffing through the peak.',
        pros: ['Rotas stabilise within days', 'Protects safe staffing ratios'],
        cons: ['Agency premium ≈ 3× substantive cost', 'No permanent capacity gained'],
        effects: {
          budget: -1.8,
          waiting: -4,
          patsat: +2,
          morale: +2,
          safety: +5,
          rep: +1
        },
        decisionSummary: 'Agency staff protected safety and flow, but created a major financial pressure.'
      },
      {
        id: 'slow_non_essential_care',
        label: 'B',
        title: 'Slow Non-Essential Care',
        description: 'Pause routine surgery and outpatient clinics for four weeks, freeing staff and beds for urgent pressure.',
        pros: ['Frees beds and staff immediately', 'Broadly cost neutral'],
        cons: ['Elective waiting list grows', 'Commissioner and media scrutiny'],
        effects: {
          budget: +0.3,
          waiting: +6,
          patsat: -3,
          morale: +2,
          safety: +3,
          rep: -2
        },
        decisionSummary: 'The Trust stabilised urgent care, but waiting list performance worsened.'
      },
      {
        id: 'rapid_discharge',
        label: 'C',
        title: 'Rapid Discharge Drive',
        description: 'Accelerate discharge planning and open a discharge lounge to free beds faster.',
        pros: ['Beds released within the week', 'Minimal direct cost'],
        cons: ['Readmission and safety risk rises', 'Discharge teams under strain'],
        effects: {
          budget: +0.1,
          waiting: -5,
          patsat: -1,
          morale: -2,
          safety: -4,
          rep: 0
        },
        decisionSummary: 'Beds were freed more quickly, but pressure moved onto wards and discharge teams.'
      },
      {
        id: 'divert_to_other_trusts',
        label: 'D',
        title: 'Divert to Other Trusts',
        description: 'Divert some ambulance flow to neighbouring trusts at peak times to reduce immediate pressure.',
        pros: ['Immediate relief at the front door', 'Ward pressure eases'],
        cons: ['Regional reputation damage', 'Neighbours may reciprocate later'],
        effects: {
          budget: -0.6,
          waiting: -3,
          patsat: -2,
          morale: +3,
          safety: +3,
          rep: -4
        },
        decisionSummary: 'Internal pressure reduced, but the Trust took a reputational hit for relying on neighbours.'
      }
    ]
  }
];
