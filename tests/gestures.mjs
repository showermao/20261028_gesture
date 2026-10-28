import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../static/gesture.js', import.meta.url), 'utf8');
const {GestureController, HandInteraction, palmSide, effectPose, EffectGestures, FingerZoom, FingerGun, isOK, OKGesture} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function hand(kind = 'palm', x = 0.3, side = 1) {
  const p = Array.from({length: 21}, () => ({x, y: 0.8}));
  [5, 9, 13, 17].forEach((base, j) => {
    const fingerX = x + (-0.1 + j * 0.07) * side;
    p[base] = {x: fingerX, y: 0.65};
    p[base + 1] = {x: fingerX, y: 0.5};
    p[base + 2] = {x: fingerX, y: 0.43};
    p[base + 3] = {x: fingerX, y: kind === 'palm' || (kind === 'first' && j === 0) || (kind === 'last' && j === 3) ? 0.25 : 0.7};
  });
  return p;
}
for (const pose of ['first', 'last']) {
  const c = new GestureController();
  assert.equal(c.update(hand(pose), 0), null);
  assert.equal(c.update(hand(pose), 500), pose);
  assert.equal(c.update(hand(pose), 2000), null);
  c.update(null, 2100); c.update(hand(pose), 2200);
  assert.equal(c.update(hand(pose), 2700), pose);
}
for (const [offset, action] of [[0.25, 'previous'], [-0.25, 'next']]) {
  const c = new GestureController(); c.update(hand('palm', 0.5), 0);
  assert.equal(c.update(hand('palm', 0.5 + offset), 200), action);
}
const tracker = new HandInteraction();
const a = hand('palm', 0.25), b = hand('palm', 0.75, -1);
assert.notEqual(palmSide(a), palmSide(hand('palm', 0.25, -1)));
const first = tracker.update([a, b], 0);
assert.equal(first.flip, false);
tracker.update([a, b], 250);
const reordered = tracker.update([b, a], 300);
assert.equal(reordered.flip, false);
assert.equal(reordered.hands[0].id, first.hands[1].id);
assert.equal(reordered.hands[1].id, first.hands[0].id);
const turned = hand('palm', 0.25, -1);
assert.equal(tracker.update([turned, b], 400).flip, false);
assert.equal(tracker.update([turned, b], 650).flip, true);
assert.equal(tracker.update([turned, b], 900).flip, false);
tracker.update([a, b], 1000);
assert.equal(tracker.update([a, b], 1250).flip, false); // cooldown, but baseline updates
tracker.update([a, b], 1500);
tracker.update([turned, b], 1800);
assert.equal(tracker.update([turned, b], 2050).flip, true);
tracker.update([], 2500);
assert.equal(tracker.update([a], 2900).flip, false); // reacquiring a hand establishes a new baseline
assert.equal(tracker.update([a], 3150).flip, false);
const edge = hand(); edge[5] = {x: 0.3, y: 0.65}; edge[17] = {x: 0.3, y: 0.6};
assert.equal(palmSide(edge), null);
const both = new HandInteraction();
both.update([a, b], 0); both.update([a, b], 250);
both.update([turned, hand('palm', 0.75)], 400);
assert.equal(both.update([turned, hand('palm', 0.75)], 650).flip, true);
assert.equal(both.update([turned, hand('palm', 0.75)], 900).flip, false);
console.log('Passed: original controls, two-hand identity, stable flip, cooldown, reacquisition, edge-on rejection, simultaneous flips.');

function effectHand(pose) {
  const p = hand('fist');
  if (pose !== 'vertical') {
    p[2] = {x: 0.18, y: 0.62};
    p[3] = {x: 0.18, y: pose === 'jump' ? 0.45 : 0.82};
    p[4] = {x: 0.18, y: pose === 'jump' ? 0.25 : 1.0};
  }
  return p;
}
for (const pose of ['vertical', 'jump', 'squat']) {
  const p = effectHand(pose), detector = new EffectGestures();
  assert.equal(effectPose(p), pose);
  assert.equal(detector.update([{id: 1, points: p}], 0).action, null);
  assert.equal(detector.update([{id: 1, points: p}], 500).action, pose);
  assert.equal(detector.update([{id: 1, points: p}], 2000).action, null);
  detector.update([{id: 1, points: hand()}], 2100);
  detector.update([{id: 1, points: p}], 2200);
  assert.equal(detector.update([{id: 1, points: p}], 2700).action, pose);
}
for (const pose of ['palm', 'first', 'last']) assert.equal(effectPose(hand(pose)), null);
const fistPair = new EffectGestures();
const fists = [1, 2].map(id => ({id, points: effectHand('vertical')}));
fistPair.update(fists, 0);
assert.equal(fistPair.update(fists, 500).action, 'vertical');
assert.equal(fistPair.update(fists, 2000).action, null);
const clap = new EffectGestures();
const pair = gap => [{id: 1, points: hand('palm', 0.5 - gap / 2)}, {id: 2, points: hand('palm', 0.5 + gap / 2, -1)}];
assert.equal(clap.update(pair(0.1), 0).action, null); // entering with hands together is not a clap
assert.equal(clap.update(pair(0.1), 100).action, null);
for (const start of [500, 2000, 3500]) {
  clap.update(pair(0.6), start);
  assert.equal(clap.update(pair(0.4), start + 100).clapping, true);
  assert.equal(clap.update(pair(0.25), start + 200).action, 'clap');
  assert.equal(clap.update(pair(0.1), start + 300).action, null);
  assert.equal(clap.update(pair(0.1), start + 400).action, null);
}
clap.update(pair(0.6), 5000); clap.update([], 5400);
assert.equal(clap.update(pair(0.1), 5500).action, null);
console.log('Passed: fist/thumb distinction, pose hold/release, simultaneous fists, three separate claps, close-hand rejection, tracking-loss rejection.');

// Reproduce overlap: two approaching palms become one before the close threshold.
const occlusion = new EffectGestures();
occlusion.update(pair(0.6), 0);
occlusion.update(pair(0.4), 100);
assert.equal(occlusion.update(pair(0.32), 200).clapping, true);
assert.equal(occlusion.update([{id: 1, points: hand('palm', 0.5)}], 280).action, 'clap');
assert.equal(occlusion.update([{id: 1, points: hand('palm', 0.5)}], 350).action, null);
// Merely losing a hand at a wide gap, or near the frame edge, is not a clap.
for (const scenario of ['far', 'edge', 'missing', 'late']) {
  const detector = new EffectGestures();
  detector.update(pair(0.6), 0);
  if (scenario !== 'far') { detector.update(pair(0.4), 100); detector.update(pair(0.32), 200); }
  const remaining = scenario === 'missing' ? [] : [{id: 1, points: hand('palm', scenario === 'edge' ? 0.9 : 0.5)}];
  assert.equal(detector.update(remaining, scenario === 'late' ? 700 : 280).action, null, scenario);
}
// Fingers may rotate out of view while approaching; do not require an open-hand
// classification at the contact frame after open palms have already armed it.
const rotated = new EffectGestures();
rotated.update(pair(0.6), 0); rotated.update(pair(0.4), 100);
const contact = pair(0.25).map(h => ({...h, points: h.points.map((p, i) => [8,12,16,20].includes(i) ? {...p, y: 0.7} : p)}));
assert.equal(rotated.update(contact, 200).action, 'clap');
console.log('Passed: clap overlap regression, edge/wide/disappearance/timeout rejection, rotated fingers at contact.');

function twoFingers(gap = 0.07) {
  const p = hand('first');
  p[8] = {x: 0.25 - gap / 2, y: 0.25};
  p[12] = {x: 0.25 + gap / 2, y: 0.25};
  return p;
}
const zoom = new FingerZoom();
const zoomHands = (gap, id = 1) => [{id, points: twoFingers(gap)}];
assert.equal(zoom.update(zoomHands(0.07)).scale, 1);
for (let i = 0; i < 30; i++) zoom.update(zoomHands(0.14));
assert.ok(Math.abs(zoom.scale - 2) < 0.001);
for (let i = 0; i < 30; i++) zoom.update(zoomHands(0.035));
assert.ok(Math.abs(zoom.scale - 0.5) < 0.001);
assert.deepEqual(zoom.update([]), {active: false, scale: 1});
assert.equal(zoom.update(zoomHands(0.14)).scale, 1); // fresh entry has a new baseline
const outside = twoFingers(); outside[12].x = 1.1;
assert.equal(zoom.update([{id: 1, points: outside}]).scale, 1);
assert.equal(zoom.handId, null);
for (const pose of ['palm', 'first', 'last', 'fist']) {
  assert.equal(zoom.update([{id: 1, points: hand(pose)}]).active, false);
}
zoom.update(zoomHands(0.07));
const translated = twoFingers(0.07).map(p => ({x: p.x + 0.1, y: p.y + 0.05}));
assert.ok(Math.abs(zoom.update([{id: 1, points: translated}]).scale - 1) < 1e-10);
const largerHand = twoFingers(0.07).map(p => ({x: 0.5 + (p.x - 0.5) * 1.1, y: 0.5 + (p.y - 0.5) * 1.1}));
assert.ok(Math.abs(zoom.update([{id: 1, points: largerHand}]).scale - 1) < 1e-10);
assert.equal(zoom.update(zoomHands(0.14, 2)).scale, 1); // another hand does not inherit the first baseline
console.log('Passed: two-finger zoom in/out, bounds, exit reset, re-entry, other poses, translation/depth stability, hand switching.');

function gunHand(raised) {
  const p = hand('first'); p[2] = {x: 0.18, y: 0.65};
  p[4] = raised ? {x: 0.36, y: 0.65} : {x: 0.19, y: 0.68};
  return [{id: 1, points: p}];
}
const gun = new FingerGun();
assert.equal(gun.update(gunHand(false), 0).shot, false); // index alone does not fire
assert.equal(gun.update(gunHand(true), 100).busy.has(1), true);
assert.equal(gun.update(gunHand(true), 350).shot, false);
assert.equal(gun.update(gunHand(false), 450).shot, true);
assert.equal(gun.update(gunHand(false), 1500).shot, false); // holding cannot auto-fire
gun.update(gunHand(true), 1600); gun.update(gunHand(true), 1850);
assert.equal(gun.update(gunHand(false), 1950).shot, true);
gun.update([], 2000);
assert.equal(gun.update(gunHand(false), 2100).shot, false); // loss of tracking disarms
for (const pose of ['palm','first','last','fist']) {
  const detector = new FingerGun();
  const points = [{id:1,points:hand(pose)}];
  assert.equal(detector.update(points,0).shot,false);
  assert.equal(detector.update(points,1000).busy.size,0);
}
const fast = new FingerGun(); fast.update(gunHand(true),0);
assert.equal(fast.update(gunHand(false),100).shot,false);
const second = new FingerGun(); second.update(gunHand(true),0); second.update(gunHand(true),250);
assert.equal(second.update(gunHand(false).map(h=>({...h,id:2})),300).shot,false);
console.log('Passed: finger-gun arm/fire, hold latch, rearm, tracking loss, pose separation, debounce, hand identity.');

const shotSource = fs.readFileSync(new URL('../static/shots.js', import.meta.url), 'utf8');
const {ShotEffects} = await import(`data:text/javascript;base64,${Buffer.from(shotSource).toString('base64')}`);
const marks = [];
const layer = {replaceChildren(){marks.length=0;},append(mark){marks.push(mark);},get firstElementChild(){return marks[0];}};
globalThis.document = {createElement(){const mark={style:{},animate(){},remove(){marks.splice(marks.indexOf(mark),1);}};return mark;}};
globalThis.matchMedia = () => ({matches:true});
const image={clientWidth:600,clientHeight:450,naturalWidth:1200,naturalHeight:600,style:{}};
const shots = new ShotEffects(image,layer);
for(let i=0;i<20;i++) assert.equal(shots.fire(),true);
assert.equal(marks.length,12); assert.equal(shots.holes.length,12);
for(const h of shots.holes){assert.ok(h.x>=15&&h.x<=85);assert.ok(h.y>25&&h.y<75);}
assert.equal(image.style.maskImage.split('radial-gradient').length-1,12);
shots.clear(); assert.equal(marks.length,0); assert.equal(image.style.maskImage,'');
image.naturalWidth=0; assert.equal(shots.fire(),false);
delete globalThis.document; delete globalThis.matchMedia;
console.log('Passed: random punctures inside contained image, hole limit, transparent masks, clearing, unloaded-image guard.');

function okHand(id = 1) {
  const p = hand('palm'); p[8] = {x: 0.21, y: 0.56}; p[4] = {x: 0.22, y: 0.56};
  return [{id, points: p}];
}
assert.equal(isOK(okHand()[0].points), true);
for (const pose of ['palm','first','last','fist']) assert.equal(isOK(hand(pose)), false);
assert.equal(isOK(twoFingers()),false);
for(const raised of [true,false]) assert.equal(isOK(gunHand(raised)[0].points),false);
const okDetector = new OKGesture();
assert.equal(okDetector.update(okHand(),0).trigger,false);
assert.equal(okDetector.update(okHand(),400).trigger,false);
assert.equal(okDetector.update(okHand(),500).trigger,true);
assert.equal(okDetector.update(okHand(),5000).trigger,false);
okDetector.update([{id:1,points:hand('palm')}],5100);
okDetector.update(okHand(),5200); // brief classification jitter does not unlatch
assert.equal(okDetector.update(okHand(),5800).trigger,false);
okDetector.update([{id:1,points:hand('palm')}],6000);
okDetector.update([{id:1,points:hand('palm')}],6200);
okDetector.update(okHand(),6300);
assert.equal(okDetector.update(okHand(),6900).trigger,true);
okDetector.reset(); okDetector.update(okHand(),0); okDetector.update([],200);
assert.equal(okDetector.update(okHand(),500).trigger,false);
const bothOK=new OKGesture();
bothOK.update([...okHand(1),...okHand(2)],0);
assert.equal(bothOK.update([...okHand(2),...okHand(1)],500).trigger,true);
assert.equal(bothOK.update([...okHand(1),...okHand(2)],5000).trigger,false);
console.log('Passed: OK pose distinction, stable hold, latch, jitter, release/rearm, tracking loss, simultaneous hands.');

const curtainSource=fs.readFileSync(new URL('../static/curtain.js',import.meta.url),'utf8');
const {CurtainEffect}=await import(`data:text/javascript;base64,${Buffer.from(curtainSource).toString('base64')}`);
const animations=[];
const overlay={hidden:true,querySelector(){return {animate(){const animation={cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;}};}};
globalThis.matchMedia=()=>({matches:false});
const curtain=new CurtainEffect(overlay);
assert.equal(curtain.play(),true);assert.equal(overlay.hidden,false);assert.equal(animations.length,3);
assert.equal(curtain.play(),false);
curtain.cancel();assert.equal(overlay.hidden,true);assert.equal(curtain.active,false);assert.ok(animations.every(a=>a.cancelled));
globalThis.matchMedia=()=>({matches:true});
assert.equal(curtain.play(),true);assert.equal(animations.length,3);curtain.cancel();
delete globalThis.matchMedia;
console.log('Passed: curtain playback, reentry guard, cleanup, reduced-motion mode.');
