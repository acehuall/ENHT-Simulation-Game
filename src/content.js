'use strict';

// All scenario data, roles, rules and quiz items live here so a facilitator or
// developer can retune the game without touching the engine or the views.
// Finance is in £k (thousands of pounds). Every other measure is 0–100.
globalThis.Northbrook = globalThis.Northbrook || {};
Northbrook.content = (() => {
  // Every threshold the game uses, in one place. tools/balance.cjs and the
  // tests read these too, so changing a number here changes it everywhere.
  const rules = {
    redLines: [
      { id: 'safety', metric: 'safety', min: 55, title: 'Safety', plain: 'Safety never drops below 55',
        consequence: 'The regulator sends inspectors. Public confidence falls 6 next quarter.', penalty: { trust: -6 } },
      { id: 'access', metric: 'access', min: 35, title: 'Access', plain: 'Access never drops below 35',
        consequence: 'Patients are left waiting on trolleys. Confidence falls 4 and experience falls 3 next quarter.', penalty: { trust: -4, experience: -3 } },
      { id: 'budget', metric: 'budget', min: -5000, title: 'Money', plain: 'The deficit never goes beyond £5.0m',
        consequence: 'NHS England puts the trust into financial special measures. Turnaround advisers cost £300k and confidence falls 4.', penalty: { budget: -300, trust: -4 } },
    ],
    knockOns: [
      { metric: 'staff', below: 50, label: 'Tired, short-staffed teams make more mistakes', effects: { safety: -4 } },
      { metric: 'access', below: 42, label: 'Crowded corridors put patients at risk', effects: { safety: -3, experience: -3 } },
      { metric: 'budget', below: -3500, label: 'A growing deficit worries the public', effects: { trust: -3 } },
    ],
    // A correct prediction earns the board credit with the regulator next quarter.
    foresight: { label: 'The board saw the risk coming', effects: { trust: 2 } },
    financeWarning: -3500,
    recurringLimit: 400,
  };

  const metrics = [
    { id: 'budget', label: 'Money', icon: 'finance', start: 0, plain: 'Position against a break-even plan. Below £0 is a deficit: spending more than the trust receives.' },
    { id: 'access', label: 'Access', icon: 'access', start: 52, plain: 'How quickly patients are seen and treated. Low access means long waits.' },
    { id: 'safety', label: 'Safety', icon: 'safety', start: 66, plain: 'How safe care is: enough checks, staff and space to avoid harm.' },
    { id: 'staff', label: 'Workforce', icon: 'staff', start: 60, plain: 'Whether staff can keep going: rest, cover and morale.' },
    { id: 'experience', label: 'Experience', icon: 'experience', start: 60, plain: 'How patients and families feel about their care.' },
    { id: 'trust', label: 'Confidence', icon: 'trust', start: 60, plain: 'How much the public, regulators and partners trust the board.' },
  ];

  // Six board roles. Objectives are weighted 3/2/1: a headline target, a
  // never-below line, and a cross-cutting line that belongs to a colleague.
  // Labels are generated from the numbers (engine.describe), so they cannot drift.
  const roles = [
    { id: 'ceo', label: 'Chief Executive', short: 'CEO', metric: 'trust', accent: '#e9b44c',
      portrait: { uniform: '#262b3a', hair: '#5a5348', accessory: 'tie' },
      brief: 'You answer for the whole hospital in public. Trust is slow to build and quick to lose.',
      prompt: 'Whose voice is missing? Ask each director for one worry before the vote.',
      objectives: [
        { metric: 'trust', type: 'end', target: 58, weight: 3 },
        { metric: 'trust', type: 'floor', target: 50, weight: 2 },
        { metric: 'budget', type: 'end', target: -3500, weight: 1 },
      ] },
    { id: 'cfo', label: 'Chief Finance Officer', short: 'CFO', metric: 'budget', accent: '#23c4b4',
      portrait: { uniform: '#0f6e64', hair: '#2e2a26', accessory: 'glasses' },
      brief: 'You protect the money that keeps care safe. Costs that keep coming back land on next year’s plan.',
      prompt: 'What does this cost now, and what does it keep costing after this year?',
      objectives: [
        { metric: 'budget', type: 'end', target: -3500, weight: 3 },
        { metric: 'recurring', type: 'max', target: 400, weight: 2 },
        { metric: 'access', type: 'end', target: 50, weight: 1 },
      ] },
    { id: 'coo', label: 'Chief Operating Officer', short: 'COO', metric: 'access', accent: '#9fd0a6',
      portrait: { uniform: '#2e5c3a', hair: '#1d1a17', accessory: 'lanyard' },
      brief: 'You own patient flow. Every blocked bed becomes someone waiting in A&E.',
      prompt: 'Where is the bottleneck now, and where will this choice move it next?',
      objectives: [
        { metric: 'access', type: 'end', target: 56, weight: 3 },
        { metric: 'access', type: 'floor', target: 44, weight: 2 },
        { metric: 'safety', type: 'floor', target: 58, weight: 1 },
      ] },
    { id: 'md', label: 'Medical Director', short: 'MD', metric: 'safety', accent: '#8aa8d8',
      portrait: { uniform: '#e8ecf5', hair: '#b9bfcc', accessory: 'stethoscope' },
      brief: 'You are the line the board does not cross. Safety fails fast and recovers slowly.',
      prompt: 'What would make this unsafe on a real ward at 3am?',
      objectives: [
        { metric: 'safety', type: 'floor', target: 60, weight: 3 },
        { metric: 'safety', type: 'end', target: 64, weight: 2 },
        { metric: 'staff', type: 'floor', target: 50, weight: 1 },
      ] },
    { id: 'cpo', label: 'Chief People Officer', short: 'CPO', metric: 'staff', accent: '#9a93c9',
      portrait: { uniform: '#43315c', hair: '#4a3c55', accessory: 'clipboard' },
      brief: 'You speak for the staff. Tired teams make mistakes, then they leave.',
      prompt: 'Who is being asked to carry this, and can they keep it up for three months?',
      objectives: [
        { metric: 'staff', type: 'end', target: 60, weight: 3 },
        { metric: 'staff', type: 'floor', target: 52, weight: 2 },
        { metric: 'experience', type: 'floor', target: 53, weight: 1 },
      ] },
    { id: 'cno', label: 'Chief Nurse', short: 'CN', metric: 'experience', accent: '#e8b9c4',
      portrait: { uniform: '#3b6ea5', hair: '#7a4a2e', accessory: 'watch' },
      brief: 'You speak for patients and families. Complaints are the early warning the board must not ignore.',
      prompt: 'Who waits longer or travels further? What would we say to them?',
      objectives: [
        { metric: 'experience', type: 'end', target: 62, weight: 3 },
        { metric: 'experience', type: 'floor', target: 53, weight: 2 },
        { metric: 'trust', type: 'end', target: 55, weight: 1 },
      ] },
  ];

  // Each option: effects apply this quarter; a commitment repeats for N later
  // quarters; recurring is the £k per quarter it keeps costing after year-end.
  // scene names the pixel vignette that plays when the decision lands.
  // helps / hurts restate the card's visible gain and risk lines as measures;
  // the board's YES!/NO! bubbles come from these, never from hidden effects.
  const quarters = [
    {
      id: 'infection', season: 'April–June', short: 'Infection outbreak', zone: 'ward', dressing: 'outbreak',
      title: 'Two bays go dark.',
      summary: 'A vomiting bug (norovirus) has closed two bays on Ward 4. One nurse in seven is off sick and A&E is filling up.',
      brief: 'Keep patients safe without burning the staff or the budget you need for the rest of the year.',
      question: 'Who pays for buying time this quarter: the budget, the staff, or the patients?',
      evidence: [
        { id: 'bays', value: '2 bays', label: 'closed on Ward 4', detail: 'The bays stay shut until the bug clears. Empty beds elsewhere still need trained nurses before they can take patients.' },
        { id: 'sickness', value: '1 in 7', label: 'nurses off sick', detail: 'The gaps are worst on the acute wards. Moving nurses from elsewhere leaves gaps there instead.' },
        { id: 'rate', value: '2×', label: 'agency pay rate', detail: 'Agency nurses can start this week but cost about twice as much. The contract includes a handover period into next quarter.' },
      ],
      pressure: 'More sickness, closed beds, and families upset by visiting limits',
      headwind: { budget: -300, access: -3, safety: -3, staff: -3, experience: -2 },
      options: [
        { id: 'agency', title: 'Book agency nurses', headline: 'AGENCY NURSES RUSHED TO BUG-HIT WARD', helps: ['safety', 'staff'], hurts: ['budget'], tag: 'Staffing', scene: 'agency',
          description: 'Fill the gaps with a short block of agency nurses.',
          gain: 'Wards are safely staffed this week', risk: 'Expensive, and the contract runs into next quarter',
          effects: { budget: -1400, access: 3, safety: 6, staff: 6, experience: 1 },
          commitment: { title: 'Agency handover period', quarters: 1, effects: { budget: -500, safety: 1 } },
          outcome: 'Ward 4 has safe cover through the peak. The handover period will still cost money next quarter.',
          lesson: 'When you book temporary staff, check what the contract still costs next quarter.' },
        { id: 'pause', title: 'Pause planned operations', headline: 'OPERATIONS PUT ON HOLD AS BUG SPREADS', helps: ['staff', 'budget'], hurts: ['access', 'experience'], tag: 'Prioritise', scene: 'pause',
          description: 'Postpone non-urgent operations and move those teams onto the wards.',
          gain: 'Frees staff without paying agency rates', risk: 'Patients wait longer and the hospital loses the income for those operations',
          effects: { budget: 300, access: -5, safety: 4, staff: 7, experience: -2, trust: -1 },
          commitment: { title: 'Backlog of postponed operations', quarters: 1, effects: { access: -2, experience: -1 } },
          outcome: 'The wards get experienced help. The people whose operations were postponed are still waiting.',
          lesson: 'Pausing work saves money on paper but loses income and builds a queue someone has to clear.' },
        { id: 'discharge', title: 'Speed up safe discharges', headline: 'PATIENTS HOME SOONER AS BEDS FREED', helps: ['access'], hurts: ['staff'], tag: 'Patient flow', scene: 'discharge',
          description: 'Daily senior reviews to get patients who are well enough home sooner.',
          gain: 'Frees beds without buying anything big', risk: 'Takes senior staff off the wards',
          effects: { budget: -400, access: 10, safety: -3, staff: -5, experience: 3, trust: 2 },
          outcome: 'More patients go home with a checked plan. Senior staff are stretched covering the reviews.',
          lesson: 'A freed bed only helps if there are staff to look after the next patient in it.' },
        { id: 'divert', title: 'Send ambulances elsewhere', headline: 'AMBULANCES TURNED AWAY FROM NORTHBROOK', helps: ['safety'], hurts: ['experience', 'trust'], tag: 'Partnership', scene: 'divert',
          description: 'Ask the neighbouring hospital to take some ambulances for a few weeks.',
          gain: 'Takes the pressure off this hospital', risk: 'Patients travel further and the neighbour gets busier',
          effects: { budget: -600, access: 6, safety: 8, staff: 2, experience: -5, trust: -6 },
          outcome: 'Fewer ambulances arrive. Some patients travel 20 minutes further, and the neighbouring hospital is stretched.',
          lesson: 'If one hospital looks better because another got busier, the patients are not better off.' },
      ],
    },
    {
      id: 'capacity', season: 'July–September', short: 'No beds', zone: 'flow', dressing: 'trolleys',
      title: 'The beds won’t empty.',
      summary: 'Patients who are well enough to leave are stuck waiting for care at home. Trolleys are queuing in the corridor.',
      brief: 'Create real capacity without stretching the staff past what is safe.',
      question: 'Are we short of beds, short of staff, or short of a way home?',
      evidence: [
        { id: 'occupancy', value: '96%', label: 'of beds full', detail: 'Almost every staffed bed is in use. A new bed takes patients only if nurses and equipment come with it.' },
        { id: 'ready', value: '24', label: 'patients ready to go home', detail: 'They are waiting for transport, medicines or a care package at home before they can leave safely.' },
        { id: 'virtual', value: '12', label: 'home monitoring places', detail: 'A “virtual ward” lets suitable patients recover at home with checks by phone and video. It needs a small team to run it.' },
      ],
      pressure: 'More emergency patients and nowhere to put them',
      headwind: { budget: -300, access: -4, safety: -2, staff: -1 },
      options: [
        { id: 'cancel', title: 'Cancel planned admissions', headline: 'PLANNED PATIENTS CANCELLED AS BEDS RUN OUT', helps: ['budget', 'staff'], hurts: ['access', 'experience'], tag: 'Prioritise', scene: 'cancel',
          description: 'Cancel some planned admissions for a month to free beds for emergencies.',
          gain: 'Frees beds now with almost no spend', risk: 'Lost income, longer waiting lists and rebooking work later',
          effects: { budget: 500, access: -4, safety: 2, staff: 6, experience: -2, trust: -2 },
          commitment: { title: 'Rebooking cancelled patients', quarters: 1, effects: { access: -3, staff: -1 } },
          outcome: 'Emergency beds become free. Cancelled patients are angry, and rebooking them will take time.',
          lesson: 'Protecting one waiting list can make another longer. Ask which patients you are counting.' },
        { id: 'partner', title: 'Fund care-at-home partners', headline: 'HOSPITAL PAYS FOR CARE AT HOME', helps: ['access', 'trust'], hurts: ['budget'], tag: 'Long term', scene: 'partner',
          description: 'Pay the council and care agencies for transport and home care packages.',
          gain: 'Fixes the real blockage over time', risk: 'Slow to start, and the contract is ongoing',
          effects: { budget: -1100, access: 2, safety: 2, staff: 2, experience: 2, trust: 3 },
          commitment: { title: 'Home care route speeds up', quarters: 2, effects: { access: 3, staff: 1, budget: -100 } },
          recurring: 300,
          outcome: 'The first care packages start slowly. As partners recruit, patients get home faster every month.',
          lesson: 'A slow fix can beat a quick one over a whole year. Compare them over the same time.' },
        { id: 'virtual', title: 'Grow the virtual ward', headline: 'HOSPITAL WARD MOVES INTO PATIENTS’ HOMES', helps: ['experience', 'access'], hurts: ['budget'], tag: 'Care at home', scene: 'virtual',
          description: 'Monitor suitable patients at home with daily check-ins.',
          gain: 'Patients recover at home and free beds', risk: 'Only suits some patients, and the team keeps costing money',
          effects: { budget: -500, access: 4, safety: 1, staff: -2, experience: 6, trust: 1 },
          commitment: { title: 'Virtual ward team', quarters: 2, effects: { budget: -200, access: 2 } },
          recurring: 200,
          outcome: 'Some patients recover at home, which frees beds. The monitoring team becomes a cost that carries on.',
          lesson: 'A new service that works becomes a running cost. Plan for next year as well as this one.' },
        { id: 'beds', title: 'Open extra emergency beds', headline: '18 EXTRA BEDS SQUEEZED INTO DAY UNIT', helps: ['access'], hurts: ['staff', 'safety', 'budget'], tag: 'Capacity', scene: 'beds',
          description: 'Open 18 extra beds in the day unit, staffed from the existing rota.',
          gain: 'Biggest quick boost to access', risk: 'Same staff spread thinner, and the beds cost money to run',
          effects: { budget: -1000, access: 14, safety: -4, staff: -5, experience: 4, trust: 1 },
          commitment: { title: 'Extra beds running costs', quarters: 1, effects: { budget: -500, access: 2, staff: -2 } },
          outcome: 'Corridors clear fast. The same nurses now cover more beds, so one sickness call leaves a gap.',
          lesson: 'A bed is not capacity unless there are staff to run it.' },
      ],
    },
    {
      id: 'confidence', season: 'October–December', short: 'In the news', zone: 'front', dressing: 'press',
      title: 'The story breaks.',
      summary: 'A local news crew is outside after patients described long waits. Staff want the board to admit what went wrong and only promise what it can deliver.',
      brief: 'Be honest, protect patients’ privacy, and keep the recovery work going.',
      question: 'What can the board prove today and still stand behind in three months?',
      evidence: [
        { id: 'stories', value: '8', label: 'patient complaints', detail: 'They raise real concerns but are not a full picture. Share overall facts and never reveal personal details.' },
        { id: 'press', value: '5pm', label: 'news deadline', detail: 'The reporter wants a response today. You can admit what you do not know yet and give a date for a full update.' },
        { id: 'reporting', value: 'Weekly', label: 'data the team can check', detail: 'Analysts can check a small weekly scorecard. A bigger report would take them away from fixing things.' },
      ],
      pressure: 'Bad headlines and a busy autumn',
      headwind: { budget: -300, access: -2, safety: -2, staff: -1, trust: -5 },
      options: [
        { id: 'statement', title: 'Issue a short statement', headline: 'HOSPITAL BOSSES SAY LITTLE', helps: ['staff', 'budget'], hurts: ['trust'], tag: 'Focus', scene: 'statement',
          description: 'Confirm the facts, promise a full update next month, and keep teams on the wards.',
          gain: 'Cheap, and protects staff time', risk: 'Looks like the board is hiding',
          effects: { budget: -250, staff: 4, experience: -1, trust: -3 },
          outcome: 'Staff stay focused on patients. Some families feel nobody is listening.',
          lesson: 'A holding statement only works if the promised update arrives on time.' },
        { id: 'briefing', title: 'Face the cameras', headline: 'BOSSES ON CAMERA: “WE GOT IT WRONG”', helps: ['trust'], hurts: ['staff'], tag: 'Openness', scene: 'briefing',
          description: 'Admit the problems on camera, share the facts and take questions.',
          gain: 'Fastest boost to public confidence', risk: 'Public promises mean public follow-up work',
          effects: { budget: -300, staff: -2, experience: 2, trust: 11 },
          commitment: { title: 'Follow-up to the public', quarters: 1, effects: { staff: -2, trust: 2 } },
          outcome: 'A straight answer wins back some trust. Now the board has to show progress in public.',
          lesson: 'A public promise needs an owner and a date, or it turns into the next story.' },
        { id: 'listen', title: 'Listen to patients first', headline: 'PATIENTS GET A SEAT AT THE TABLE', helps: ['experience'], hurts: ['trust'], tag: 'Patient voice', scene: 'listen',
          description: 'An independent panel of patients and staff, then publish what you heard.',
          gain: 'Finds what is really going wrong', risk: 'Slower than the news cycle',
          effects: { budget: -200, access: -1, staff: 4, experience: 9, trust: 2 },
          outcome: 'The panel finds booking and communication failures nobody had measured. The news coverage stays mixed for now.',
          lesson: 'Stories show you where to look. Then count how often it happens before you decide.' },
        { id: 'plan', title: 'Publish a recovery plan', headline: 'HOSPITAL PUBLISHES RECOVERY PLAN', helps: ['access', 'safety'], hurts: ['budget', 'staff'], tag: 'Delivery', scene: 'plan',
          description: 'A costed plan with a weekly scorecard and named owners.',
          gain: 'Links promises to real work on the wards', risk: 'Costs money and staff time to deliver',
          effects: { budget: -500, staff: -2, experience: 2, trust: 6 },
          commitment: { title: 'Recovery plan delivery', quarters: 1, effects: { budget: -300, access: 4, safety: 3 } },
          outcome: 'Teams have clear targets and a weekly check. The work starts paying off next quarter.',
          lesson: 'Pair every promise with money, a measure and a review date.' },
      ],
    },
    {
      id: 'winter', season: 'January–March', short: 'Winter surge', zone: 'arrival', dressing: 'winter',
      title: 'One last surge.',
      summary: 'Snow and flu are sending more ambulances. Six shifts are still empty and this is the board’s last decision of the year.',
      brief: 'Get through winter safely and hand next year’s board something it can live with.',
      question: 'Which problem can next year’s board live with, and which must be fixed now?',
      evidence: [
        { id: 'arrivals', value: '+19%', label: 'more ambulances', detail: 'Arrivals are up on last week. Anything that frees beds only helps if it works fast enough.' },
        { id: 'rota', value: '6', label: 'shifts still empty', detail: 'Rest breaks and supervision matter as much as headcount when staff are this tired.' },
        { id: 'aid', value: '72 hrs', label: 'help offered by partners', detail: 'Neighbouring hospitals can lend staff for three days. Plan what happens on day four.' },
      ],
      pressure: 'Snow, flu and staff off sick',
      headwind: { budget: -400, access: -5, safety: -3, staff: -3 },
      options: [
        { id: 'wellbeing', title: 'Protect the winter rota', headline: 'NIGHT STAFF GET TAXIS HOME AS SNOW BITES', helps: ['staff', 'safety'], hurts: ['budget', 'access'], tag: 'Staff first', scene: 'wellbeing',
          description: 'Pay for extra supervisors, cover for rest breaks and taxis home after night shifts.',
          gain: 'Best protection for staff and safety', risk: 'Expensive, and the queue barely moves',
          effects: { budget: -1300, safety: 8, staff: 11, experience: 2, trust: 1 },
          outcome: 'Staff get breaks and get home safely. The waiting room is still full.',
          lesson: 'Spending on safety can be right even when the waiting list does not move.' },
        { id: 'redeploy', title: 'Move our own teams to A&E', headline: 'THEATRE TEAMS SENT TO A&E', helps: ['budget'], hurts: ['staff', 'experience'], tag: 'Reallocate', scene: 'redeploy',
          description: 'Move trained staff from planned care to the emergency department.',
          gain: 'Keeps money in hand', risk: 'Planned care stops and staff are pulled away from their own patients',
          effects: { budget: 400, access: 6, safety: 1, staff: -5, experience: -4, trust: -2 },
          outcome: 'A&E gets experienced help without new spending. Planned patients wait, and the moved teams are worn out.',
          lesson: 'Saving money by moving staff shifts the cost to workload and waiting lists.' },
        { id: 'lounge', title: 'Open the discharge lounge late', headline: 'LATE LOUNGE GETS PATIENTS HOME', helps: ['access'], hurts: ['staff', 'budget'], tag: 'Flow', scene: 'lounge',
          description: 'Keep the discharge lounge and transport running into the evening.',
          gain: 'Biggest boost to access', risk: 'Needs staff every evening and becomes a running cost',
          effects: { budget: -600, access: 8, safety: 2, staff: -2, experience: 6, trust: 4 },
          recurring: 300,
          outcome: 'Beds free up hours earlier each day. The late lounge needs staff every evening from now on.',
          lesson: 'If a fix needs extra shifts every week, put the cost in next year’s plan.' },
        { id: 'aid', title: 'Borrow staff from partners', headline: 'NEIGHBOURS LEND STAFF IN WINTER CRISIS', helps: ['access', 'safety'], hurts: ['experience', 'trust'], tag: 'Partnership', scene: 'aid',
          description: 'Agree three days of help from neighbouring hospitals, reviewed daily.',
          gain: 'Free help at the worst moment', risk: 'Patients travel further, and the favour must be returned',
          effects: { budget: 0, access: 9, safety: 4, staff: 2, experience: -3, trust: -3 },
          outcome: 'Borrowed staff help through the worst days. Nobody has agreed what happens on day four.',
          lesson: 'When you borrow help, agree how you will hand it back.' },
      ],
    },
  ];

  const skills = {
    scope: 'Who pays for a decision',
    time: 'Costs over time',
    systems: 'Knock-on effects',
    governance: 'Owning a decision',
  };

  // Matched sets: item n tests the same skill at similar difficulty in every
  // set, so warm-up versus learning-check is a fair comparison. Answers are
  // shown in a fixed scrambled order (`order`, or a seeded shuffle); `correct`
  // indexes the authored order. Positions are balanced: 4 A, 4 B, 4 C overall.
  const questions = {
    baseline: [
      { id: 'b-scope', skill: 'scope', prompt: 'A hospital postpones planned operations so A&E has more beds. Which number shows who paid for that?',
        answers: ['The number of free beds in A&E at the end of each day', 'How many people are now waiting for operations', 'How much agency staff cost this month'], correct: 1,
        why: 'The free beds are the benefit. The patients whose operations were postponed carry the cost.' },
      { id: 'b-time', skill: 'time', prompt: 'Agency nurses cost £400k this quarter and £200k next quarter for a handover. What should the plan show?',
        answers: ['£400k now, and mention the £200k as a risk', '£600k: £400k now and £200k next quarter', '£400k, because next quarter is a new budget'], correct: 1,
        why: 'Both costs are agreed when the contract is signed. Show the full cost in the quarters it falls.' },
      { id: 'b-systems', skill: 'systems', prompt: 'A ward opens 18 extra beds but has no extra nurses. What is most likely to happen?',
        answers: ['Waits fall at first, then mistakes and sickness rise', 'Waits fall by about 18 patients a day, and stay down for good', 'Nothing changes because beds are not the problem'], correct: 0,
        why: 'The same nurses now cover more patients. Spreading them thinner raises the risk of harm.' },
      { id: 'b-governance', skill: 'governance', prompt: 'The board agrees to fix long waits. Which note in the minutes lets it check later whether it worked?',
        answers: ['“The board discussed waits and was reassured.”', '“Agreed in principle; teams to do further work.”', '“Agreed. COO to report waiting times on 14 May.”'], correct: 2, order: [0, 2, 1],
        why: 'A named owner, a measure and a date make a decision checkable.' },
    ],
    transfer: [
      { id: 't-scope', skill: 'scope', prompt: 'A school cuts its library hours to save money. Which question best finds who paid for that?',
        answers: ['How much money did the school save over the whole year?', 'Which students used the library in those hours?', 'Was the change agreed by the governors?'], correct: 1,
        why: 'Savings are the benefit. The students who lost access carry the cost.' },
      { id: 't-time', skill: 'time', prompt: 'A pilot costs £300k to set up and £100k each quarter for two quarters. What goes in the decision paper?',
        answers: ['£500k in total, shown quarter by quarter', '£300k, because running costs come from another budget', '£400k, the first two quarters only'], correct: 0,
        why: 'Short projects still have running costs. Show the whole cost and when each part falls.' },
      { id: 't-systems', skill: 'systems', prompt: 'Weekend operating lists cut the waiting list. A month later, theatre staff sickness rises. What should the board look at first?',
        answers: ['Whether the shorter waiting list will last into spring', 'Whether the extra weekends are wearing staff out', 'Whether it can afford to add even more weekend lists'], correct: 1, order: [1, 0, 2],
        why: 'Tired staff affect safety. The first gain caused a second problem.' },
      { id: 't-governance', skill: 'governance', prompt: 'You fund an evening discharge service. Which follow-up best checks it?',
        answers: ['The service sends the board a monthly count of evening discharges', 'COO reviews discharges and readmissions in four weeks', 'Finance counts how many evening shifts were paid'], correct: 1,
        why: 'Name the owner, check the result and any side effect (readmissions), and set a date.' },
    ],
    recall: [
      { id: 'r-scope', skill: 'scope', prompt: 'Cutting scanner sessions saves money, but more scans are postponed. What should the board see?',
        answers: ['The saving, the postponed scans and any harm', 'The saving, because postponed scans can be caught up later', 'How busy the remaining sessions are'], correct: 0, order: [1, 2, 0],
        why: 'Show the benefit next to who carried the cost and what harm it could cause.' },
      { id: 'r-time', skill: 'time', prompt: 'A one-off saving of £120k brings new running costs of £80k in each of the next two quarters. What is the overall effect?',
        answers: ['£120k better, as running costs are a separate budget', '£40k better: the saving minus one quarter', '£40k worse: £120k saved, £160k spent'], correct: 2, order: [2, 0, 1],
        why: '£120k minus £160k is £40k worse. Keep one-off savings and ongoing costs apart.' },
      { id: 'r-systems', skill: 'systems', prompt: 'Beds stay 96% full even after more are added. What best shows where the real blockage is?',
        answers: ['Staffed beds, and how long ready patients wait to leave', 'How many beds there are now compared with this time last year', 'How many staff the whole hospital employs'], correct: 0, order: [1, 0, 2],
        why: 'Compare staffed beds with patient flow. The blockage may be staff or the route home.' },
      { id: 'r-governance', skill: 'governance', prompt: 'The board promises shorter A&E waits. What makes that promise checkable?',
        answers: ['A public announcement with a launch date for the new plan', 'Every director agreeing it is a priority', 'An owner, today’s figure, a target and a review date'], correct: 2, order: [0, 1, 2],
        why: 'An owner and a measurable comparison on a set date make accountability real.' },
    ],
  };

  // Facilitator crib. Timings come from the simulated group session and should
  // be replaced with measured times after a real pilot.
  const facilitator = {
    timing: 'Plan 45 minutes for a group: 5 to choose roles, about 8 per quarter, 8 for the year-end. A solo player takes about 15.',
    quarters: [
      { ask: 'Staff or money? Agency nurses protect tired staff but cost twice as much. Who wins this quarter, and why?',
        watch: 'If they pick agency, point at “Already committed” next quarter. If they don’t, ask the MD what happens to safety.', minutes: 9 },
      { ask: 'Are we short of beds, staff, or a way home? Point to one piece of evidence on screen.',
        watch: 'Extra beds look obvious. Ask “who staffs them?”, then show the knock-on step in the replay.', minutes: 8 },
      { ask: 'What can we say today that we will still stand behind in three months?',
        watch: 'Facing the cameras is popular. Ask what it commits the board to deliver next quarter.', minutes: 8 },
      { ask: 'Everyone: which of your own goals would you give up to protect someone else’s?',
        watch: 'Point at the money bar and its red-line notch before they vote: how much room is left?', minutes: 8 },
    ],
    debrief: 'Each role names one decision that hurt their goals. Was it worth it for the hospital? What evidence would have changed the vote?',
  };

  const glossary = [
    ['Board', 'The small group of directors in charge of running the hospital.'],
    ['Deficit', 'Spending more than the hospital receives. The plan is to break even (£0).'],
    ['Red line', 'A limit the board must never cross. Crossing one brings the regulator in.'],
    ['Agency staff', 'Temporary staff hired through an agency, usually at a higher rate.'],
    ['Discharge', 'Sending a patient home (or to care) once they are well enough.'],
    ['Virtual ward', 'Patients recover at home while staff check on them remotely.'],
    ['Ongoing cost', 'A cost that keeps coming back every quarter, including next year.'],
    ['Quarter', 'Three months. The year has four.'],
  ];

  return { rules, metrics, roles, quarters, skills, questions, facilitator, glossary };
})();
