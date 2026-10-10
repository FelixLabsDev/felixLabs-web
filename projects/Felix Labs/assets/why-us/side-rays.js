import { Mesh, Program, Renderer, Triangle } from "../vendor/ogl.min.js";

function hexToRgb(hex) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
}

function originToFlip(origin) {
  switch (origin) {
    case "top-left": return [1, 0];
    case "bottom-right": return [0, 1];
    case "bottom-left": return [1, 1];
    default: return [0, 0];
  }
}

var VERT = [
  "attribute vec2 position;",
  "void main() {",
  "  gl_Position = vec4(position, 0.0, 1.0);",
  "}"
].join("\n");

var FRAG = [
  "precision highp float;",
  "uniform float iTime;",
  "uniform vec2 iResolution;",
  "uniform float iSpeed;",
  "uniform vec3 iRayColor1;",
  "uniform vec3 iRayColor2;",
  "uniform float iIntensity;",
  "uniform float iSpread;",
  "uniform float iFlipX;",
  "uniform float iFlipY;",
  "uniform float iTilt;",
  "uniform float iSaturation;",
  "uniform float iBlend;",
  "uniform float iFalloff;",
  "uniform float iOpacity;",
  "float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {",
  "  vec2 sourceToCoord = coord - raySource;",
  "  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);",
  "  return clamp(",
  "    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +",
  "    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),",
  "    0.0, 1.0) *",
  "    clamp((iResolution.x - length(sourceToCoord)) / iResolution.x, 0.5, 1.0);",
  "}",
  "void main() {",
  "  vec2 fragCoord = gl_FragCoord.xy;",
  "  if (iFlipX > 0.5) fragCoord.x = iResolution.x - fragCoord.x;",
  "  if (iFlipY > 0.5) fragCoord.y = iResolution.y - fragCoord.y;",
  "  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);",
  "  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);",
  "  float tiltRad = iTilt * 3.14159265 / 180.0;",
  "  float cs = cos(tiltRad);",
  "  float sn = sin(tiltRad);",
  "  vec2 rel = coord - rayPos;",
  "  vec2 tiltedCoord = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + rayPos;",
  "  float halfSpread = iSpread * 0.275;",
  "  vec2 rayRefDir1 = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));",
  "  vec2 rayRefDir2 = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));",
  "  vec4 rays1 = vec4(iRayColor1, 1.0) * rayStrength(rayPos, rayRefDir1, tiltedCoord, 36.2214, 21.11349, iSpeed);",
  "  vec4 rays2 = vec4(iRayColor2, 1.0) * rayStrength(rayPos, rayRefDir2, tiltedCoord, 22.3991, 18.0234, iSpeed * 0.2);",
  "  vec4 color = rays1 * (1.0 - iBlend) * 0.9 + rays2 * iBlend * 0.9;",
  "  float distanceToLight = length(fragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;",
  "  float brightness = iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);",
  "  color.rgb *= brightness;",
  "  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));",
  "  color.rgb = mix(vec3(gray), color.rgb, iSaturation);",
  "  color.a = max(color.r, max(color.g, color.b)) * iOpacity;",
  "  gl_FragColor = color;",
  "}"
].join("\n");

var REST_INTENSITY = 1.7;
var HOVER_INTENSITY = 1.9;

var DEFAULTS = {
  speed: 1.2,
  rayColor1: "#4b54db",
  rayColor2: "#a4aaff",
  intensity: REST_INTENSITY,
  spread: 2,
  origin: "top-right",
  tilt: 0,
  saturation: 1.15,
  blend: 0.62,
  falloff: 1.6,
  opacity: 1
};

function mountSideRays(container, options) {
  var opts = Object.assign({}, DEFAULTS, options || {});
  var renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: true });
  var gl = renderer.gl;
  gl.canvas.style.width = "100%";
  gl.canvas.style.height = "100%";
  gl.canvas.style.display = "block";
  gl.canvas.setAttribute("aria-hidden", "true");
  container.appendChild(gl.canvas);

  var flip = originToFlip(opts.origin);
  var uniforms = {
    iTime: { value: 0 },
    iResolution: { value: [1, 1] },
    iSpeed: { value: opts.speed },
    iRayColor1: { value: hexToRgb(opts.rayColor1) },
    iRayColor2: { value: hexToRgb(opts.rayColor2) },
    iIntensity: { value: opts.intensity },
    iSpread: { value: opts.spread },
    iFlipX: { value: flip[0] },
    iFlipY: { value: flip[1] },
    iTilt: { value: opts.tilt },
    iSaturation: { value: opts.saturation },
    iBlend: { value: opts.blend },
    iFalloff: { value: opts.falloff },
    iOpacity: { value: opts.opacity }
  };

  var mesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, { vertex: VERT, fragment: FRAG, uniforms: uniforms })
  });

  var raf = 0;
  var running = false;
  var targetIntensity = REST_INTENSITY;

  function updateSize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (!w || !h) return;
    renderer.dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(w, h);
    uniforms.iResolution.value = [w * renderer.dpr, h * renderer.dpr];
  }

  function loop(t) {
    if (!running) return;
    uniforms.iTime.value = t * 0.001;
    var current = uniforms.iIntensity.value;
    uniforms.iIntensity.value = current + (targetIntensity - current) * 0.12;
    renderer.render({ scene: mesh });
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("resize", updateSize);

  return {
    start: function () {
      if (running) return;
      running = true;
      updateSize();
      raf = requestAnimationFrame(loop);
    },
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    setHover: function (on) {
      targetIntensity = on ? HOVER_INTENSITY : REST_INTENSITY;
    },
    renderOnce: function () {
      updateSize();
      renderer.render({ scene: mesh });
    },
    destroy: function () {
      this.stop();
      window.removeEventListener("resize", updateSize);
      try {
        var lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (e) {}
      if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
    }
  };
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fineHover() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function bindWhyItem(item) {
  var holder = item.querySelector(".side-rays-container");
  if (!holder) return;
  var instance = null;

  function ensure() {
    if (!instance) instance = mountSideRays(holder);
    return instance;
  }

  function onEnter() {
    if (!fineHover() || reduceMotion()) return;
    ensure().setHover(true);
  }

  function onLeave() {
    if (instance) instance.setHover(false);
  }

  item.addEventListener("pointerenter", onEnter);
  item.addEventListener("pointerleave", onLeave);

  if (!("IntersectionObserver" in window)) {
    ensure();
    if (reduceMotion()) instance.renderOnce();
    else instance.start();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    var visible = entries[0] && entries[0].isIntersecting;
    if (visible) {
      ensure();
      if (reduceMotion()) instance.renderOnce();
      else instance.start();
    } else if (instance) {
      instance.stop();
    }
  }, { rootMargin: "80px", threshold: 0.05 });
  io.observe(item);
}

document.querySelectorAll(".why-item").forEach(bindWhyItem);
