export class CurtainEffect {
  constructor(element) { this.element = element; this.animations = []; this.active = false; }
  cancel() {
    clearTimeout(this.timer);
    this.animations.forEach(animation => animation.cancel());
    this.animations = []; this.active = false; this.element.hidden = true;
  }
  play() {
    if (this.active) return false;
    this.active = true; this.element.hidden = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      for (const [selector, direction] of [['.curtain-left', -102], ['.curtain-right', 102]]) {
        this.animations.push(this.element.querySelector(selector).animate([
          {transform: `translateX(${direction}%)`, offset: 0},
          {transform: 'translateX(0)', offset: 0.25},
          {transform: 'translateX(0)', offset: 0.65},
          {transform: `translateX(${direction}%)`, offset: 1},
        ], {duration: 3000, easing: 'ease-in-out', fill: 'both'}));
      }
      this.animations.push(this.element.querySelector('.curtain-message').animate([
        {opacity: 0, offset: 0}, {opacity: 0, offset: 0.25},
        {opacity: 1, offset: 0.35}, {opacity: 1, offset: 0.65}, {opacity: 0, offset: 0.8}, {opacity: 0, offset: 1},
      ], {duration: 3000, fill: 'both'}));
    }
    this.timer = setTimeout(() => this.cancel(), reduced ? 1600 : 3000);
    return true;
  }
}
