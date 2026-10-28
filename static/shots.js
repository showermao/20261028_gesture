// The image mask makes real transparent holes; the rim is a separate decoration.
export class ShotEffects {
  constructor(image, layer) { this.image = image; this.layer = layer; this.holes = []; }
  clear() {
    this.holes = []; this.layer.replaceChildren();
    this.image.style.maskImage = ''; this.image.style.webkitMaskImage = '';
  }
  fire() {
    const width = this.image.clientWidth, height = this.image.clientHeight;
    if (!width || !height || !this.image.naturalWidth) return false;
    const fit = Math.min(width / this.image.naturalWidth, height / this.image.naturalHeight);
    const contentWidth = this.image.naturalWidth * fit, contentHeight = this.image.naturalHeight * fit;
    const x = ((width - contentWidth) / 2 + contentWidth * (0.15 + Math.random() * 0.7)) / width * 100;
    const y = ((height - contentHeight) / 2 + contentHeight * (0.15 + Math.random() * 0.7)) / height * 100;
    this.holes.push({x, y});
    if (this.holes.length > 12) { this.holes.shift(); this.layer.firstElementChild?.remove(); }
    const mark = document.createElement('span'); mark.className = 'bullet-hole';
    mark.style.left = `${x}%`; mark.style.top = `${y}%`;
    this.layer.append(mark);
    const mask = this.holes.map(h => `radial-gradient(circle 11px at ${h.x}% ${h.y}%, transparent 95%, black 100%)`).join(',');
    this.image.style.maskImage = mask; this.image.style.webkitMaskImage = mask;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mark.animate([{opacity: 0, scale: '1.8'}, {opacity: 1, scale: '1'}], {duration: 220, easing: 'ease-out'});
    }
    return true;
  }
}
