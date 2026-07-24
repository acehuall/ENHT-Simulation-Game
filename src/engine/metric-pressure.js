'use strict';
/* ---------- metric pressure (phase 6) ----------
   Pure derivation of "how hard the theatre should push" from live band state.

   metric-semantics.js answers "what does this number mean"; this module answers
   "how hard should the ward visibly react". No DOM, no canvas, no RNG. Every
   output is a pure function of (simT, live band state), so replaying the same
   simT yields identical output.

   Reads getMetricValue / getMetricBand and the tone-keyed PRESSURE_MODEL only.
   NEVER writes METRIC_CUR, GAME.stats or GAME.statsByQuarter - this is a
   render-input derivation, not a source of truth.

   Loaded after metrics.js (needs getMetricValue) and before the renderer that
   consumes it (timeline-visuals.js). hash/clamp/ease come from canvas.js.
---------------------------------------------------------------------------- */

var PRESSURE_SMOOTH_SECS = 1.5;

/* Anchors: key -> {tone, fromTone, fromIntensity, atSimT}. This is a memo of
   observed tone transitions, not an accumulator - intensity is always
   recomputed from simT, never incremented frame to frame.
     tone          - the tone the metric is easing TOWARD (its current band)
     fromTone      - the tone it is easing FROM (for secondary-field easing)
     fromIntensity - the primary channel intensity at the moment of transition,
                     so an interrupted ease starts from its partial value
     atSimT        - the sim-time the current transition began */
var _pressureAnchor = {};

/* The primary tone-keyed intensity field for each channel. Secondary fields
   (illTintFromTone, flashLightsFromTone) are read separately by the renderer. */
function _pressureIntensityField(channel){
  switch(channel){
    case 'staffIdle': return 'idleByTone';
    default:          return 'byTone';
  }
}

/* Live band tone for a metric, or 'neutral' when it has no value/band. */
function _pressureLiveTone(key){
  var val = (typeof getMetricValue==='function') ? getMetricValue(key) : null;
  var band = (val==null) ? null : getMetricBand(key, val);
  return band ? band.tone : 'neutral';
}

/* Eased progress 0..1 from an anchor's start to simT. */
function _pressureProgress(anchor, simT){
  return ease(clamp(((Number(simT)||0)-anchor.atSimT)/PRESSURE_SMOOTH_SECS, 0, 1));
}

/* Advance the anchor set to simT. Idempotent and monotonic: calling twice with
   the same simT is a no-op, and calling with a LOWER simT than the anchor
   rebases (a scrub back is not a transition). Call once per frame from
   drawMetricPressureCue, before any getPressure* read. */
function updateMetricPressure(simT){
  simT = Number(simT) || 0;
  var key, model, liveTone, field, map, target, anchor, current;
  for(key in PRESSURE_MODEL){
    if(!PRESSURE_MODEL.hasOwnProperty(key)) continue;
    model = PRESSURE_MODEL[key];
    liveTone = _pressureLiveTone(key);
    field = _pressureIntensityField(model.channel);
    map = model[field] || {};
    target = map.hasOwnProperty(liveTone) ? map[liveTone] : 0;
    anchor = _pressureAnchor[key];
    if(!anchor || simT < anchor.atSimT){
      /* first sight, or a scrub back to before the anchor: settle on the live
         target with no easing rather than animating into it */
      _pressureAnchor[key] = {tone:liveTone, fromTone:liveTone, fromIntensity:target, atSimT:simT};
      continue;
    }
    if(liveTone !== anchor.tone){
      /* genuine tone change: freeze the currently-eased primary intensity as
         the new from-value and re-anchor at simT */
      current = getMetricPressure(key, simT).intensity;
      _pressureAnchor[key] = {tone:liveTone, fromTone:anchor.tone, fromIntensity:current, atSimT:simT};
    }
    /* same tone, simT >= atSimT: no-op - intensity is recomputed from simT */
  }
}

/* -> {key, tone, targetIntensity, intensity, channel} or null when the metric
   has no PRESSURE_MODEL entry. `intensity` is the eased value:
   lerp(fromIntensity, targetIntensity, ease(clamp((simT-atSimT)/1.5,0,1))). */
function getMetricPressure(key, simT){
  var model = PRESSURE_MODEL[key];
  if(!model) return null;
  var field = _pressureIntensityField(model.channel);
  var map = model[field] || {};
  var anchor = _pressureAnchor[key], tone, target, from, intensity;
  if(!anchor){
    /* not yet advanced: settle on the live target with no easing */
    tone = _pressureLiveTone(key);
    target = map.hasOwnProperty(tone) ? map[tone] : 0;
    return {key:key, tone:tone, targetIntensity:target, intensity:target, channel:model.channel};
  }
  tone = anchor.tone;
  target = map.hasOwnProperty(tone) ? map[tone] : 0;
  from = anchor.fromIntensity;
  intensity = from + (target - from) * _pressureProgress(anchor, simT);
  return {key:key, tone:tone, targetIntensity:target, intensity:intensity, channel:model.channel};
}

/* -> scalar for a named tone-keyed field, e.g.
   getPressureScalar('waiting','illTintFromTone',simT). Reads the tone-keyed
   map, eased identically between the from-tone and current-tone values. Never
   extrapolates. -> 0 when the field or metric is absent. */
function getPressureScalar(key, field, simT){
  var model = PRESSURE_MODEL[key];
  if(!model || !model[field]) return 0;
  var map = model[field];
  var anchor = _pressureAnchor[key], tone;
  if(!anchor){
    tone = _pressureLiveTone(key);
    return map.hasOwnProperty(tone) ? map[tone] : 0;
  }
  var target = map.hasOwnProperty(anchor.tone) ? map[anchor.tone] : 0;
  var from = map.hasOwnProperty(anchor.fromTone) ? map[anchor.fromTone] : 0;
  return from + (target - from) * _pressureProgress(anchor, simT);
}

/* -> [{key, channel, intensity, tone}] for every channel above zero. Walked
   once per frame by the renderer. */
function getActivePressures(simT){
  var out = [], key, p;
  for(key in PRESSURE_MODEL){
    if(!PRESSURE_MODEL.hasOwnProperty(key)) continue;
    p = getMetricPressure(key, simT);
    if(p && p.intensity > 0) out.push({key:key, channel:p.channel, intensity:p.intensity, tone:p.tone});
  }
  return out;
}

/* Clear all anchors and re-seed from current values with zero easing, so the
   next frame renders the settled state rather than animating into it. Called
   from both rewind paths (seekSimulation and render's rewound branch). */
function resetMetricPressure(simT){
  _pressureAnchor = {};
  updateMetricPressure(Number(simT) || 0);
}
