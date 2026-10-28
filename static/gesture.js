// Pure gesture logic; x positions use the mirrored preview coordinate system.
function extendedFingers(points) {
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  return [8, 12, 16, 20].map((tip) => distance(tip, 0) > distance(tip - 2, 0) * 1.18 && distance(tip, 5) > distance(tip - 1, 5));
}
export function fingerPose(points) {
  const extended = extendedFingers(points);
  if (extended.every(Boolean)) return 'palm';
  if (extended[0] && extended.slice(1).every(v => !v)) return 'first';
  if (extended[3] && extended.slice(0, 3).every(v => !v)) return 'last';
  return null;
}

export class FingerZoom {
  constructor() { this.reset(); }
  reset() { this.handId = null; this.baseline = null; this.scale = 1; }
  update(hands) {
    const candidates = hands.filter(({points}) => {
      const fingers = extendedFingers(points);
      return fingers[0] && fingers[1] && !fingers[2] && !fingers[3] &&
        [8, 12].every(i => points[i].x > 0 && points[i].x < 1 && points[i].y > 0 && points[i].y < 1);
    });
    const hand = candidates.find(h => h.id === this.handId) || candidates[0];
    if (!hand) { this.reset(); return {active: false, scale: 1}; }
    const distance = (a, b) => Math.hypot(hand.points[a].x - hand.points[b].x, hand.points[a].y - hand.points[b].y);
    const palm = distance(0, 9);
    const gap = distance(8, 12) / palm;
    if (palm < 0.025 || !Number.isFinite(gap) || gap < 0.02) {
      this.reset(); return {active: false, scale: 1};
    }
    if (this.handId !== hand.id) { this.reset(); this.handId = hand.id; this.baseline = gap; }
    const target = Math.max(0.5, Math.min(2.5, gap / this.baseline));
    this.scale += (target - this.scale) * 0.3;
    return {active: true, handId: hand.id, scale: this.scale};
  }
}

export class FingerGun {
  constructor() { this.reset(); }
  reset() { this.states = new Map(); this.lastShot = -Infinity; }
  update(hands, now) {
    const visible = new Set(hands.map(h => h.id));
    for (const id of this.states.keys()) if (!visible.has(id)) this.states.delete(id);
    let shot = false;
    const busy = new Set();
    for (const {id, points: p} of hands) {
      const fingers = extendedFingers(p);
      if (!fingers[0] || fingers.slice(1).some(Boolean)) { this.states.delete(id); continue; }
      const distance = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
      const size = distance(0, 9);
      if (size < 0.025) { this.states.delete(id); continue; }
      const ix = p[8].x - p[5].x, iy = p[8].y - p[5].y;
      const tx = p[4].x - p[2].x, ty = p[4].y - p[2].y;
      const spread = Math.abs(ix * ty - iy * tx) / Math.max(Math.hypot(ix, iy) * size, 0.001);
      let state = this.states.get(id);
      if (!state) { state = {since: now, armed: false, fired: false}; this.states.set(id, state); }
      if (spread > 0.65) {
        busy.add(id);
        if (state.fired) { state.since = now; state.fired = false; }
        if (now - state.since >= 180) { state.armed = true; state.armedAt = now; }
      } else if (state.armed && spread < 0.35 && now - state.armedAt <= 1200) {
        busy.add(id); state.armed = false; state.fired = true;
        if (now - this.lastShot >= 650) { shot = true; this.lastShot = now; }
      } else if (state.armed || state.fired) {
        busy.add(id);
        if (state.armed && now - state.armedAt > 1200) this.states.delete(id);
      } else {
        state.since = now;
      }
    }
    return {shot, busy};
  }
}

export function isOK(points) {
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const size = distance(0, 9);
  const fingers = extendedFingers(points);
  return size > 0.025 && distance(4, 8) < size * 0.35 &&
    distance(8, 5) < distance(6, 5) * 1.5 && fingers.slice(1).every(Boolean);
}

export class OKGesture {
  constructor() { this.reset(); }
  reset() { this.states = new Map(); this.lastTrigger = -Infinity; }
  update(hands, now) {
    const visible = new Set(hands.map(h => h.id));
    for (const id of this.states.keys()) if (!visible.has(id)) this.states.delete(id);
    let trigger = false;
    const busy = new Set();
    for (const {id, points} of hands) {
      let state = this.states.get(id);
      if (!isOK(points)) {
        if (state) {
          if (state.releaseSince === null) state.releaseSince = now;
          if (now - state.releaseSince >= 150) this.states.delete(id);
        }
        continue;
      }
      busy.add(id);
      if (!state) { state = {since: now, latched: false, releaseSince: null}; this.states.set(id, state); }
      if (state.releaseSince !== null && !state.latched) state.since = now;
      state.releaseSince = null;
      if (!state.latched && now - state.since >= 500) {
        state.latched = true;
        if (now - this.lastTrigger >= 3500) { trigger = true; this.lastTrigger = now; }
      }
    }
    return {trigger, busy};
  }
}

export class GestureController {
  constructor() { this.reset(); this.lastTrigger = -Infinity; }
  reset() { this.history = []; this.pose = null; this.poseSince = 0; this.latched = false; }
  update(points, now) {
    if (!points) { this.reset(); return null; }
    const pose = fingerPose(points);
    if (pose !== this.pose) { this.pose = pose; this.poseSince = now; this.latched = false; this.history = []; }
    if (pose === 'palm') {
      const x = 1 - [0, 5, 9, 13, 17].reduce((sum, i) => sum + points[i].x, 0) / 5;
      this.history.push({x, time: now});
      this.history = this.history.filter(p => now - p.time < 650);
      const start = this.history[0];
      if (now - this.lastTrigger >= 1100 && now - start.time >= 130 && Math.abs(x - start.x) > 0.19) {
        this.lastTrigger = now; this.history = [];
        return x < start.x ? 'previous' : 'next';
      }
    } else if ((pose === 'first' || pose === 'last') && !this.latched && now - this.poseSince >= 450 && now - this.lastTrigger >= 1100) {
      this.latched = true; this.lastTrigger = now; return pose;
    }
    return null;
  }
}

// A signed palm triangle changes direction when a hand turns over, but not
// when it translates or rotates within the image plane. Ignore edge-on palms.
export function palmSide(points) {
  const a = {x: points[5].x - points[0].x, y: points[5].y - points[0].y};
  const b = {x: points[17].x - points[0].x, y: points[17].y - points[0].y};
  const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  const normal = length ? (a.x * b.y - a.y * b.x) / length : 0;
  return Math.abs(normal) < 0.28 ? null : Math.sign(normal);
}

export class HandInteraction {
  constructor() { this.reset(); }
  reset() { this.tracks = []; this.nextId = 0; this.lastFlip = -Infinity; }
  update(hands, now) {
    this.tracks = this.tracks.filter(t => now - t.seen <= 350);
    const pairs = [];
    for (const track of this.tracks) hands.forEach((points, index) => {
      pairs.push({track, index, distance: Math.hypot(track.wrist.x - points[0].x, track.wrist.y - points[0].y)});
    });
    pairs.sort((a, b) => a.distance - b.distance);
    const assigned = new Map(), used = new Set();
    for (const pair of pairs) {
      if (pair.distance < 0.28 && !assigned.has(pair.index) && !used.has(pair.track.id)) {
        assigned.set(pair.index, pair.track); used.add(pair.track.id);
      }
    }
    let flip = false;
    const visible = hands.map((points, index) => {
      let track = assigned.get(index);
      if (!track) {
        track = {id: this.nextId++, side: null, candidate: null, since: now, blockedUntil: 0};
        this.tracks.push(track);
      }
      track.wrist = points[0]; track.seen = now;
      const side = fingerPose(points) === 'palm' ? palmSide(points) : null;
      if (side === null) {
        track.candidate = null; track.blockedUntil = now + 250;
      } else {
        if (track.candidate !== side) { track.candidate = side; track.since = now; }
        if (track.side !== null && side !== track.side) track.blockedUntil = now + 350;
        if (now - track.since >= 220) {
          if (track.side !== null && side !== track.side) flip = true;
          track.side = side;
        }
      }
      // Finger poses retain the original first/last controls; block only palm swipes during a turn.
      return {id: track.id, points, turning: fingerPose(points) === 'palm' && now < track.blockedUntil};
    });
    const trigger = flip && now - this.lastFlip >= 1100;
    if (trigger) this.lastFlip = now;
    return {hands: visible, flip: trigger};
  }
}

export function effectPose(points) {
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  // Require all four fingers to curl; the thumb determines fist/up/down.
  const curled = [8, 12, 16, 20].every(tip =>
    distance(tip, tip - 3) < distance(tip - 2, tip - 3) * 1.35);
  if (!curled) return null;
  const size = distance(0, 9);
  if (size < 0.025) return null;
  const dx = points[4].x - points[2].x, dy = points[4].y - points[2].y;
  const thumbOut = distance(4, 2) > size * 0.65 && distance(4, 5) > size * 0.8;
  if (thumbOut) {
    if (Math.abs(dy) > Math.abs(dx) * 1.3) return dy < 0 ? 'jump' : 'squat';
    return null; // sideways thumb is neither a fist nor a vertical thumb gesture
  }
  return 'vertical';
}

export class ClapDetector {
  constructor() { this.reset(); }
  reset() {
    this.armed = false; this.farGap = 0; this.farAt = 0;
    this.lastPair = null; this.lastApproach = -Infinity;
  }
  update(hands, now) {
    const center = p => [0, 5, 9, 13, 17].reduce((c, i) => ({x: c.x + p[i].x / 5, y: c.y + p[i].y / 5}), {x: 0, y: 0});
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const finish = () => { this.reset(); return {trigger: true, clapping: true, progress: '已辨識拍手，請重新分開雙手'}; };
    if (this.armed && now - this.farAt > 1800) this.reset();
    if (hands.length === 2) {
      const [a, b] = hands.map(h => h.points);
      const size = Math.max((distance(a[0], a[9]) + distance(b[0], b[9])) / 2, 0.025);
      const centers = [center(a), center(b)];
      const gap = distance(...centers) / size;
      if (this.lastPair && now - this.lastPair.time > 300) this.reset();
      // Require open hands only when arming: fingers become foreshortened at contact.
      const open = hands.every(h => [8, 12, 16, 20].filter(tip =>
        distance(h.points[tip], h.points[tip - 3]) > distance(h.points[tip - 2], h.points[tip - 3]) * 1.4).length >= 3);
      if (open && gap > 2.2) {
        if (!this.armed) this.farGap = gap;
        this.armed = true; this.farGap = Math.max(this.farGap, gap); this.farAt = now;
      }
      const contracted = this.farGap - gap;
      if (this.armed && this.lastPair && gap < this.lastPair.gap - 0.08 && contracted > 0.35) this.lastApproach = now;
      const approaching = this.armed && contracted > 0.35 && now - this.lastApproach < 300;
      this.lastPair = {gap, size, time: now, midpoint: {x: (centers[0].x + centers[1].x) / 2, y: (centers[0].y + centers[1].y) / 2}};
      if (approaching && gap < 1.75 && contracted > 0.8) return finish();
      return {trigger: false, clapping: approaching, progress: approaching ? '雙手正在靠近，繼續拍合' : this.armed ? '拍手已準備：將雙手向中間拍合' : '拍手：請張開雙手並分開約兩個手掌距離'};
    }
    // Accept a brief one-hand occlusion only after a measured near-contact approach.
    // A hand simply leaving the frame, or both hands disappearing, is insufficient.
    const pair = this.lastPair;
    if (this.armed && pair && hands.length === 1 && now - pair.time <= 220 &&
        now - this.lastApproach <= 220 && pair.gap < 2.5 && this.farGap - pair.gap > 0.8 &&
        distance(center(hands[0].points), pair.midpoint) < pair.size * 1.1) return finish();
    if (!pair || now - pair.time > 250) this.reset();
    return {trigger: false, clapping: this.armed && now - this.lastApproach <= 220,
      progress: hands.length === 1 ? '目前只看到一隻手，請讓雙手都進入畫面' : '拍手：請讓雙手進入畫面'};
  }
}

export class EffectGestures {
  constructor() { this.reset(); }
  reset() {
    this.poses = new Map(); this.lastTrigger = -Infinity;
    this.clap = new ClapDetector();
  }
  update(hands, now) {
    const visible = new Set(hands.map(h => h.id));
    for (const id of this.poses.keys()) if (!visible.has(id)) this.poses.delete(id);
    const clap = this.clap.update(hands, now);
    const clapping = clap.clapping;
    let progress = clap.progress;
    if (clap.trigger) {
      this.poses.clear();
      if (now - this.lastTrigger >= 1100) {
        this.lastTrigger = now;
        return {action: 'clap', clapping: true, progress};
      }
      progress = '拍手間隔太短，請稍候再分開雙手拍合';
    }
    let action = null;
    for (const hand of hands) {
      const pose = effectPose(hand.points);
      let state = this.poses.get(hand.id);
      if (!state || state.pose !== pose) {
        state = {pose, since: now, latched: false}; this.poses.set(hand.id, state);
      }
      if (pose && !state.latched && now - state.since >= 450 && !clapping) {
        state.latched = true;
        if (now - this.lastTrigger >= 1100) { action = pose; this.lastTrigger = now; }
      }
    }
    return {action, clapping, progress};
  }
}
