'use strict';
/* ---------- quarterly board decision data ---------- */
var QUARTERS = [
  {
    title: 'The Corridor Crisis',
    scenario: 'It is early January and there has been an immense rise in flu cases impacting the Trust. Bed occupancy is at 97%. Several staff are off sick, and wards are understaffed. The board must decide how to respond before corridor care, safety incidents and public criticism worsen.',
    options: [
      {
        id: 'hire_temporary_staff',
        label: 'A',
        title: 'Hire Temporary Staff',
        description: 'Hire temporary agency staff to cover sickness and stabilise ward staffing.',
        effects: {
          budget: -1.8,
          waiting: +5,
          patsat: +3,
          morale: +2,
          safety: +5,
          rep: +1
        },
        decisionSummary: 'Temporary staff protected safety and flow, but created a major financial pressure.'
      },
      {
        id: 'slow_non_essential_care',
        label: 'B',
        title: 'Slow Non-Essential Care',
        description: 'Slow lower-priority care to free up staff and beds for urgent pressure.',
        effects: {
          budget: +0.3,
          waiting: -7,
          patsat: -3,
          morale: +2,
          safety: +2,
          rep: -2
        },
        decisionSummary: 'The Trust stabilised urgent care, but waiting list performance worsened.'
      },
      {
        id: 'rapid_discharge',
        label: 'C',
        title: 'Rapid Discharge',
        description: 'Accelerate discharge planning to free beds faster.',
        effects: {
          budget: +0.1,
          waiting: +3,
          patsat: -1,
          morale: -2,
          safety: -3,
          rep: 0
        },
        decisionSummary: 'Beds were freed more quickly, but pressure moved onto wards and discharge teams.'
      },
      {
        id: 'divert_to_other_trusts',
        label: 'D',
        title: 'Divert to Other Trusts',
        description: 'Divert some patients to nearby trusts to reduce immediate pressure.',
        effects: {
          budget: -0.6,
          waiting: +4,
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
