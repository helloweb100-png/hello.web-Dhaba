/* ==========================================================================
   DHABA · app.js
   --------------------------------------------------------------------------
   Sin dependencias. Un solo IIFE dividido en módulos:
     1. Configuración (EDITA SOLO EL BLOQUE CONFIG antes de publicar)
     2. Utilidades, tema, preloader
     3. Efectos: titulares, revelado, contadores, motor de scroll,
        hero (partículas, mandala, tilt), puntero
     4. Secciones: nav, diálogos, manifiesto, tarjetas apiladas,
        bebidas horizontales, pasos, guía, galería
     5. Comercio: menú, pedido, WhatsApp, formulario

   Reglas de rendimiento:
   - Sin listeners de scroll. El scroll se lee con IntersectionObserver y un
     único bucle rAF que solo corre mientras hay secciones visibles.
   - Solo se animan transform y opacity.
   - Todo respeta prefers-reduced-motion.
   ========================================================================== */
(() => {
'use strict';

/* ==========================================================================
   1. CONFIGURACION  (EDITA AQUI)
   ========================================================================== */
const CONFIG = {
    // Número de WhatsApp con código de país, SIN "+" ni espacios. Ej: '5215512345678'
    // Mientras esté vacío, los botones abren WhatsApp con el mensaje listo y
    // la persona elige el contacto.
    whatsapp: '5215548099981',
    phoneLabel: '+52 55 4809 9981',   // Cómo se muestra el teléfono. Ej: '+52 55 1234 5678'
    hours: '',        // Ej: 'Lunes a domingo, 1:00 pm a 9:00 pm'
    address: '',      // Ej: 'Calle Hidalgo 123, Centro'
    mapsUrl: '',      // Enlace de Google Maps (opcional, vuelve clicable la dirección)
    instagram: '',    // URL completa (opcional)
    facebook: 'https://www.facebook.com/share/1EM5peCWLc/',
    tiktok: '',
    greeting: 'Hola Dhaba, quiero hacer un pedido',
};

/* ==========================================================================
   2. UTILIDADES
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const root = document.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
const reduced = () => mqReduce.matches;
const money = (n) => '$' + Number(n).toLocaleString('es-MX');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const safe = (fn, name) => { try { fn(); } catch (err) { console.error('[Dhaba] ' + (name || fn.name) + ':', err); } };

const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } },
};

const waUrl = (text) => `https://wa.me/${String(CONFIG.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

function openWhatsApp(text) {
    const a = document.createElement('a');
    a.href = waUrl(text);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function toast(message, action) {
    const host = $('#toasts');
    if (!host) return;
    host.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-check"/></svg><span></span>';
    $('span', t).textContent = message;
    if (action) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = action.label;
        b.addEventListener('click', () => { action.run(); t.remove(); });
        t.appendChild(b);
    }
    host.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 400); }, 3200);
}

/* Aplica CONFIG a enlaces, textos y redes */
function hydrateConfig() {
    $$('[data-wa]').forEach((a) => {
        a.href = waUrl(a.dataset.waText || CONFIG.greeting);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    });
    if (CONFIG.phoneLabel) $$('[data-cfg-phone]').forEach((a) => { a.textContent = CONFIG.phoneLabel; });
    if (CONFIG.hours) $$('[data-cfg="hours"]').forEach((n) => { n.textContent = CONFIG.hours; });
    if (CONFIG.address) {
        $$('[data-cfg="address"]').forEach((n) => {
            if (CONFIG.mapsUrl) {
                const a = document.createElement('a');
                a.href = CONFIG.mapsUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
                a.textContent = CONFIG.address;
                n.replaceWith(a);
            } else n.textContent = CONFIG.address;
        });
    }
    ['instagram', 'facebook', 'tiktok'].forEach((k) => {
        if (!CONFIG[k]) return;
        const li = $(`[data-cfg-social="${k}"]`);
        if (!li) return;
        $('a', li).href = CONFIG[k];
        li.hidden = false;
    });
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
}

/* ==========================================================================
   TEMA (Noche / Día)
   ========================================================================== */
function initTheme() {
    const btn = $('#theme-toggle');
    const meta = $('meta[name="theme-color"]');
    const apply = (t, persist) => {
        root.setAttribute('data-theme', t);
        if (meta) meta.setAttribute('content', t === 'light' ? '#f6f0e0' : '#06130c');
        if (btn) btn.setAttribute('aria-label', t === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
        if (persist) { try { localStorage.setItem('dhaba:theme', t); } catch (e) { /* noop */ } }
        document.dispatchEvent(new CustomEvent('themechange'));
    };
    apply(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
    if (!btn) return;
    btn.addEventListener('click', () => {
        root.classList.add('theme-anim');
        apply(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
        setTimeout(() => root.classList.remove('theme-anim'), 700);
    });
}

/* ==========================================================================
   PRELOADER
   Progreso real: espera fuentes y carga de la página (con tope de 6.5 s) y
   nunca baja del tiempo mínimo para que la animación se lea. Al terminar, las
   dos puertas se abren y se dispara la entrada del hero (html.is-ready).
   ========================================================================== */
function finishLoad() {
    root.classList.remove('is-loading');
    root.classList.add('loader-out', 'is-ready');
    setTimeout(() => {
        root.classList.add('loader-done');
        const l = $('#loader');
        if (l) l.remove();
    }, 1400);
    setTimeout(() => {
        const wa = $('.wa-float');
        if (!wa) return;
        wa.classList.add('show-tip');
        setTimeout(() => wa.classList.remove('show-tip'), 5200);
    }, 5200);
}

function initLoader() {
    const loader = $('#loader');
    if (!loader) { finishLoad(); return; }

    const pctEl = $('#loader-pct');
    const arc = $('#loader-arc');
    const cap = $('#loader-caption');
    const messages = ['Moliendo las especias', 'Encendiendo el fuego', 'Preparando el chai', 'Calentando el naan', 'Sirviendo tu mesa'];

    let seen = false;
    try { seen = sessionStorage.getItem('dhaba:seen') === '1'; } catch (e) { /* noop */ }
    const DURATION = reduced() ? 450 : (seen ? 1100 : 2900);

    let ready = false;
    let shown = 0;
    let msg = 0;
    let finished = false;
    const t0 = performance.now();
    let lastMsg = t0;

    Promise.race([
        Promise.all([
            document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve(),
            new Promise((res) => { if (document.readyState === 'complete') res(); else addEventListener('load', res, { once: true }); }),
        ]),
        new Promise((res) => setTimeout(res, 6500)),
    ]).then(() => { ready = true; });

    const ease = (t) => 1 - Math.pow(1 - t, 3);

    function frame(now) {
        if (finished) return;
        let p = ease(clamp((now - t0) / DURATION)) * 100;
        if (!ready) p = Math.min(p, 92);
        shown = Math.max(shown, p);
        pctEl.textContent = Math.round(shown);
        arc.style.strokeDashoffset = String(100 - shown);

        if (now - lastMsg > 620 && msg < messages.length - 1 && shown < 96) {
            lastMsg = now;
            msg += 1;
            cap.classList.add('is-swap');
            setTimeout(() => { cap.textContent = messages[msg]; cap.classList.remove('is-swap'); }, 240);
        }
        if (shown >= 99.6) {
            finished = true;
            pctEl.textContent = '100';
            arc.style.strokeDashoffset = '0';
            try { sessionStorage.setItem('dhaba:seen', '1'); } catch (e) { /* noop */ }
            setTimeout(finishLoad, 380);
            return;
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}


/* ==========================================================================
   3. EFECTOS
   ========================================================================== */

/* ---------- Titulares: cada palabra sube desde una máscara ---------- */
function wrapWords(el, { mask = true, cls = 'w', innerCls = 'wi' } = {}) {
    let n = 0;
    const walk = (node) => {
        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType === 3) {
                const frag = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach((part) => {
                    if (!part) return;
                    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                    const inner = document.createElement('span');
                    inner.className = mask ? innerCls : cls;
                    inner.style.setProperty('--w', n++);
                    inner.textContent = part;
                    if (mask) {
                        const outer = document.createElement('span');
                        outer.className = cls;
                        outer.setAttribute('aria-hidden', 'true');
                        outer.appendChild(inner);
                        frag.appendChild(outer);
                    } else {
                        inner.setAttribute('aria-hidden', 'true');
                        frag.appendChild(inner);
                    }
                });
                child.replaceWith(frag);
            } else if (child.nodeType === 1) walk(child);
        });
    };
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    walk(el);
    el.setAttribute('aria-label', label);
    return n;
}

function initSplit() {
    $$('[data-split]').forEach((el) => wrapWords(el));
}

/* ---------- Revelado al entrar en pantalla ---------- */
function initReveal() {
    const items = $$('[data-reveal], [data-split]:not([data-split-hero])');
    if (reduced() || !('IntersectionObserver' in window)) {
        items.forEach((e) => e.classList.add('is-in'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (!en.isIntersecting) return;
            en.target.classList.add('is-in');
            io.unobserve(en.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach((e) => io.observe(e));
}

/* ---------- Contadores ---------- */
function initCounters() {
    const els = $$('[data-count]');
    if (reduced() || !('IntersectionObserver' in window)) return;
    const run = (el) => {
        const target = Number(el.dataset.count);
        const dur = 1700;
        const t0 = performance.now();
        const step = (now) => {
            const t = clamp((now - t0) / dur);
            const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            el.textContent = Math.round(target * e);
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (!en.isIntersecting) return;
            run(en.target);
            io.unobserve(en.target);
        });
    }, { threshold: 0.6 });
    els.forEach((el) => { el.textContent = '0'; io.observe(el); });
}

/* ==========================================================================
   MOTOR DE SCROLL
   Sin listeners de scroll: cada sección registrada se observa con
   IntersectionObserver y el bucle rAF corre solo mientras haya alguna visible.
   fn(rect, viewportHeight, leaving)
   ========================================================================== */
const Engine = (() => {
    const items = new Map();
    const active = new Set();
    let raf = 0;

    const tick = () => {
        raf = 0;
        const vh = innerHeight;
        active.forEach((el) => items.get(el)(el.getBoundingClientRect(), vh, false));
        if (active.size) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const io = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                const fn = items.get(en.target);
                if (!fn) return;
                if (en.isIntersecting) { active.add(en.target); kick(); }
                else { active.delete(en.target); fn(en.target.getBoundingClientRect(), innerHeight, true); }
            });
        }, { rootMargin: '30% 0px 30% 0px' })
        : null;

    return {
        add(el, fn) {
            if (!el) return;
            items.set(el, fn);
            if (io) io.observe(el); else fn(el.getBoundingClientRect(), innerHeight, false);
        },
        refresh: kick,
    };
})();

/* ==========================================================================
   HERO
   ========================================================================== */

/* Mandala procedural: anillos de marcas, pétalos y rosetón */
function buildMandala() {
    const svg = $('#mandala');
    if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (name, attrs) => {
        const e = document.createElementNS(NS, name);
        Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
        return e;
    };
    const rot = (deg) => `rotate(${deg})`;

    const base = mk('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linecap': 'round' });

    // Anillo de marcas (96)
    const ticks = mk('g', { opacity: '.7' });
    for (let i = 0; i < 96; i++) {
        const long = i % 4 === 0;
        ticks.appendChild(mk('line', { x1: 0, y1: -(long ? 268 : 274), x2: 0, y2: -282, transform: rot(i * 3.75) }));
    }
    base.appendChild(ticks);

    // Pétalos exteriores (24)
    const petals = mk('g', { opacity: '.85' });
    for (let i = 0; i < 24; i++) {
        petals.appendChild(mk('path', { d: 'M0,-214 Q19,-236 0,-262 Q-19,-236 0,-214Z', transform: rot(i * 15) }));
    }
    base.appendChild(petals);

    base.appendChild(mk('circle', { r: 203, 'stroke-dasharray': '3 9', opacity: '.8' }));

    // Rosetón interior que gira en sentido contrario (12)
    const inner = mk('g', { class: 'm-rev', opacity: '.75' });
    for (let i = 0; i < 12; i++) {
        inner.appendChild(mk('path', { d: 'M0,-150 Q24,-178 0,-200 Q-24,-178 0,-150Z', transform: rot(i * 30 + 15) }));
    }
    inner.appendChild(mk('circle', { r: 148, opacity: '.6' }));
    base.appendChild(inner);

    // Puntos en las puntas
    const dots = mk('g', { fill: 'currentColor', stroke: 'none', opacity: '.9' });
    for (let i = 0; i < 24; i++) {
        const a = (i * 15 - 90) * Math.PI / 180;
        dots.appendChild(mk('circle', { cx: (Math.cos(a) * 266).toFixed(1), cy: (Math.sin(a) * 266).toFixed(1), r: i % 2 ? 1.6 : 2.6 }));
    }
    base.appendChild(dots);
    svg.appendChild(base);
}

/* Particulas: brasas doradas que suben + constelacion entre las cercanas */
function initEmbers() {
    const canvas = $('#embers');
    if (!canvas || reduced()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;
    let parts = [];
    let rgb = '248,222,147';
    let sprite = null;
    let visible = true;
    let running = false;
    let last = 0;
    const mouse = { x: -999, y: -999 };

    const buildSprite = () => {
        rgb = getComputedStyle(root).getPropertyValue('--ember').trim() || rgb;
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const c = sprite.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.25, `rgba(${rgb},.55)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
    };

    const spawn = (fromBottom) => ({
        x: Math.random() * w,
        y: fromBottom ? h + 12 : Math.random() * h,
        r: 0.7 + Math.random() * 2.3,
        vy: -(0.12 + Math.random() * 0.42),
        vx: (Math.random() - 0.5) * 0.14,
        ph: Math.random() * 6.28,
        sp: 0.4 + Math.random() * 0.9,
        a: 0.3 + Math.random() * 0.6,
        tw: Math.random() * 6.28,
    });

    const resize = () => {
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = Math.round(clamp((w * h) / 13000, 26, 96));
        if (parts.length > count) parts.length = count;
        while (parts.length < count) parts.push(spawn(false));
    };

    const draw = (now) => {
        if (!running) return;
        const dt = Math.min(2.2, (now - last) / 16.67 || 1);
        last = now;
        ctx.clearRect(0, 0, w, h);

        const links = w >= 820;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            p.ph += 0.012 * p.sp * dt;
            p.tw += 0.03 * dt;
            p.x += (p.vx + Math.sin(p.ph) * 0.22) * dt;
            p.y += p.vy * dt;

            const dx = p.x - mouse.x, dy = p.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 14400) {                 // 120 px: los granos se apartan del cursor
                const d = Math.sqrt(d2) || 1;
                const f = (1 - d / 120) * 2.2;
                p.x += (dx / d) * f * dt;
                p.y += (dy / d) * f * dt;
            }
            if (p.y < -14 || p.x < -14 || p.x > w + 14) Object.assign(p, spawn(true));

            const size = p.r * 9;
            ctx.globalAlpha = p.a * (0.65 + 0.35 * Math.sin(p.tw));
            ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);

            if (links) {
                for (let j = i + 1; j < parts.length; j++) {
                    const q = parts[j];
                    const lx = p.x - q.x, ly = p.y - q.y;
                    const ld = lx * lx + ly * ly;
                    if (ld < 11000) {
                        ctx.globalAlpha = (1 - ld / 11000) * 0.22;
                        ctx.strokeStyle = `rgb(${rgb})`;
                        ctx.lineWidth = 0.7;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                        ctx.stroke();
                    }
                }
            }
        }
        ctx.globalAlpha = 1;
        requestAnimationFrame(draw);
    };

    const start = () => {
        if (running || !visible || document.hidden) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(draw);
    };
    const stop = () => { running = false; };

    buildSprite();
    resize();
    new ResizeObserver(resize).observe(canvas);
    document.addEventListener('themechange', buildSprite);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(canvas);

    const hero = canvas.closest('.hero');
    hero.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -999; });
    start();
}

/* Hero: salida con parallax al bajar + inclinación 3D del escudo con el cursor */
function initHero() {
    const hero = $('#inicio');
    const vis = $('#hero-visual');
    const copy = $('#hero-copy');
    const crest = $('#crest');
    const spot = $('.hero-spot', hero);
    if (!hero || !vis || !copy) return;

    if (!reduced()) {
        Engine.add(hero, (rect) => {
            const p = clamp(-rect.top / (rect.height * 0.9));
            vis.style.transform = `translate3d(0, ${(p * 80).toFixed(1)}px, 0) scale(${(1 - p * 0.07).toFixed(3)})`;
            copy.style.transform = `translate3d(0, ${(p * -46).toFixed(1)}px, 0)`;
            copy.style.opacity = String((1 - p * 0.95).toFixed(3));
        });
    }

    if (reduced() || !mqFine.matches || !crest) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, busy = false;
    const step = () => {
        cx = lerp(cx, tx, 0.085);
        cy = lerp(cy, ty, 0.085);
        crest.style.setProperty('--ry', (cx * 10).toFixed(2) + 'deg');
        crest.style.setProperty('--rx', (-cy * 8).toFixed(2) + 'deg');
        if (Math.abs(cx - tx) > 0.002 || Math.abs(cy - ty) > 0.002) requestAnimationFrame(step);
        else busy = false;
    };
    const ping = () => { if (!busy) { busy = true; requestAnimationFrame(step); } };
    hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top) / r.height;
        tx = (nx - 0.5) * 2;
        ty = (ny - 0.5) * 2;
        spot.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
        spot.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
        ping();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { tx = ty = 0; ping(); });
}

/* ---------- Puntero fino: foco en tarjetas y botones magnéticos ---------- */
function initPointerFx() {
    if (reduced() || !mqFine.matches) return;

    document.addEventListener('pointermove', (e) => {
        const t = e.target.closest && e.target.closest('.spot-card');
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
        t.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });

    $$('.magnetic').forEach((b) => {
        b.addEventListener('pointermove', (e) => {
            const r = b.getBoundingClientRect();
            const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
            const y = (e.clientY - (r.top + r.height / 2)) * 0.32;
            b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        });
        b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
}


/* ==========================================================================
   4. SECCIONES
   ========================================================================== */

/* ---------- Navegación: estado "scrolled" y enlace activo ---------- */
function initNav() {
    const header = $('#site-header');
    if (!header || !('IntersectionObserver' in window)) return;

    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:48px;pointer-events:none';
    document.body.prepend(sentinel);
    new IntersectionObserver(([e]) => header.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);

    const links = $$('.nav-desktop a');
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            const a = byId.get(en.target.id);
            if (!a) return;
            if (en.isIntersecting) {
                links.forEach((l) => l.removeAttribute('aria-current'));
                a.setAttribute('aria-current', 'true');
            } else if (a.getAttribute('aria-current')) {
                a.removeAttribute('aria-current');
            }
        });
    }, { rootMargin: '-42% 0px -52% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

/* ---------- Diálogos nativos (menú móvil y pedido) ---------- */
const Dialogs = {
    open(dlg) {
        if (!dlg || dlg.open) return;
        dlg.showModal();
        root.classList.add('no-scroll');
        requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
    },
    close(dlg) {
        if (!dlg || !dlg.open) return;
        dlg.classList.remove('is-open');
        const done = () => { if (dlg.open) dlg.close(); root.classList.remove('no-scroll'); };
        if (reduced()) done(); else setTimeout(done, 650);
    },
};

function initDialogs() {
    $$('dialog').forEach((dlg) => {
        dlg.addEventListener('click', (e) => { if (e.target === dlg) Dialogs.close(dlg); });
        dlg.addEventListener('cancel', (e) => { e.preventDefault(); Dialogs.close(dlg); });
        $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => Dialogs.close(dlg)));
    });
    const burger = $('#burger');
    if (burger) burger.addEventListener('click', () => Dialogs.open($('#nav-dialog')));
    $$('[data-open-cart]').forEach((b) => b.addEventListener('click', () => Dialogs.open($('#cart'))));
    // Si se agranda la ventana con el menú móvil abierto, se cierra
    matchMedia('(min-width: 1100px)').addEventListener('change', (e) => { if (e.matches) Dialogs.close($('#nav-dialog')); });
}

/* ---------- Manifiesto: las palabras se iluminan con el scroll ---------- */
function initManifesto() {
    const p = $('#manifesto-text');
    const section = p && p.closest('section');
    if (!p) return;
    wrapWords(p, { mask: false, cls: 'sw' });
    const words = $$('.sw', p);
    if (reduced()) { words.forEach((w) => w.classList.add('is-lit')); return; }
    let last = -1;
    Engine.add(section, (rect, vh) => {
        const prog = clamp((vh * 0.82 - rect.top) / (rect.height * 0.78 + vh * 0.08));
        const lit = Math.round(prog * words.length * 1.04);
        if (lit === last) return;
        last = lit;
        words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    });
}

/* ---------- Especialidades: tarjetas que se apilan ---------- */
function initStack() {
    const stack = $('#stack');
    if (!stack || reduced()) return;
    const cards = $$('.stack-card', stack);
    if (cards.length < 2) return;
    let tops = [];
    const measure = () => { tops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0); };
    measure();
    addEventListener('resize', measure);
    Engine.add(stack, (rect, vh) => {
        for (let i = 0; i < cards.length - 1; i++) {
            const nextTop = cards[i + 1].getBoundingClientRect().top;
            const p = clamp((vh - nextTop) / Math.max(1, vh - tops[i + 1]));
            cards[i].style.setProperty('--p', p.toFixed(3));
        }
    });
}

/* ---------- Bebidas: el scroll vertical se vuelve horizontal ---------- */
function initHPan() {
    const sec = $('[data-hpan]');
    if (!sec || reduced()) return;
    const viewport = $('.hpan-viewport', sec);
    const track = $('.hpan-track', sec);
    const cards = $$('.drink', track);
    if (!viewport || !track || !cards.length) return;

    let dist = 0;
    let vh = innerHeight;
    let cur = -1;

    const hexToRgba = (hex, a) => {
        const n = parseInt(hex.replace('#', ''), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };

    const measure = () => {
        vh = innerHeight;
        sec.classList.remove('is-hijack');
        sec.style.height = '';
        track.style.transform = '';
        const gutter = parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
        dist = track.offsetWidth + gutter * 2 - viewport.clientWidth;
        if (dist > 48) {
            sec.classList.add('is-hijack');
            sec.style.height = `${Math.round(dist + vh)}px`;
        } else {
            dist = 0;
        }
        Engine.refresh();
    };

    Engine.add(sec, (rect) => {
        if (!dist) return;
        const p = clamp(-rect.top / Math.max(1, rect.height - vh));
        track.style.transform = `translate3d(${(-dist * p).toFixed(1)}px, 0, 0)`;
        sec.style.setProperty('--hp', p.toFixed(4));
        const idx = Math.round(p * (cards.length - 1));
        if (idx !== cur) {
            cur = idx;
            sec.style.setProperty('--tint', hexToRgba(cards[idx].dataset.tint || '#e8b949', 0.3));
        }
    });

    measure();
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(measure, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    addEventListener('load', measure);
}

/* ---------- Cómo pedir: la línea se dibuja con el scroll ---------- */
function initSteps() {
    const steps = $('#steps');
    if (!steps) return;
    const items = $$('.step', steps);
    if (reduced()) {
        steps.style.setProperty('--prog', 1);
        items.forEach((i) => i.classList.add('is-on'));
        return;
    }
    const wide = matchMedia('(min-width: 900px)');
    Engine.add(steps, (rect, vh) => {
        const p = wide.matches
            ? clamp((vh * 0.88 - rect.top) / (vh * 0.42))
            : clamp((vh * 0.72 - rect.top) / Math.max(1, rect.height * 0.92));
        steps.style.setProperty('--prog', p.toFixed(3));
        items.forEach((it, i) => it.classList.toggle('is-on', p >= i / (items.length - 1) - 0.02));
    });
}

/* ---------- Guía: tarjetas que giran ---------- */
function initFlips() {
    const flips = $$('.flip');
    flips.forEach((f) => {
        const front = $('.flip-front', f);
        const back = $('.flip-back', f);
        back.inert = true;
        const set = (open) => {
            f.classList.toggle('is-open', open);
            front.setAttribute('aria-expanded', String(open));
            back.inert = !open;
        };
        front.addEventListener('click', () => {
            const open = !f.classList.contains('is-open');
            flips.forEach((o) => { if (o !== f && o.classList.contains('is-open')) { o.classList.remove('is-open'); $('.flip-front', o).setAttribute('aria-expanded', 'false'); $('.flip-back', o).inert = true; } });
            set(open);
        });
        back.addEventListener('click', (e) => { if (!e.target.closest('a')) { set(false); front.focus({ preventScroll: true }); } });
    });
}

/* ---------- Galería: acordeón con pie interactivo ---------- */
function initGallery() {
    const items = $$('.gp-item');
    const cap = $('#gp-caption');
    if (!items.length || !cap) return;
    const ctl = $('#gp-ctl');
    let current = '';

    const show = (id, animate = true) => {
        if (id === current) return;
        current = id;
        items.forEach((i) => {
            const on = i.dataset.dish === id;
            i.classList.toggle('is-active', on);
            i.setAttribute('aria-pressed', String(on));
        });
        const d = Cart.dish(id);
        if (!d) return;
        $('#gp-name').textContent = d.name;
        $('#gp-desc').textContent = d.desc;
        $('#gp-price').textContent = money(d.price);
        ctl.innerHTML = Cart.ctlHtml(d.id, d.name);
        Cart.syncAll();
        if (animate && !reduced()) {
            cap.classList.remove('is-swap');
            void cap.offsetWidth;
            cap.classList.add('is-swap');
        }
    };

    items.forEach((i) => {
        i.addEventListener('click', () => show(i.dataset.dish));
        i.addEventListener('focus', () => show(i.dataset.dish));
        if (mqFine.matches) i.addEventListener('pointerenter', () => show(i.dataset.dish));
    });
    show(items[0].dataset.dish, false);
}


/* ==========================================================================
   5. COMERCIO: pedido, menú y WhatsApp
   ========================================================================== */

/* ---------- Pedido (se guarda en el navegador) ---------- */
const Cart = (() => {
    const KEY = 'dhaba:cart:v1';
    const dishes = {};
    $$('.dish').forEach((el) => {
        dishes[el.dataset.id] = {
            id: el.dataset.id,
            name: el.dataset.name,
            price: Number(el.dataset.price),
            desc: $('.dish-desc', el).textContent,
        };
    });

    let items = store.get(KEY, {});
    Object.keys(items).forEach((id) => { if (!dishes[id] || !(items[id] > 0)) delete items[id]; });

    const ids = () => Object.keys(items);
    const count = () => ids().reduce((s, id) => s + items[id], 0);
    const total = () => ids().reduce((s, id) => s + items[id] * dishes[id].price, 0);
    const lines = () => ids().map((id) => `• ${items[id]} x ${dishes[id].name} (${money(dishes[id].price)}) = ${money(items[id] * dishes[id].price)}`);

    const ctlHtml = (id, name) => `<div class="qty-ctl" data-ctl="${id}">
<button class="add-btn" type="button" data-add="${id}" aria-label="Agregar ${name} al pedido"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>
<div class="stepper" hidden>
<button type="button" data-dec="${id}" aria-label="Quitar uno: ${name}"><svg class="i" aria-hidden="true"><use href="#i-minus"/></svg></button>
<output aria-live="polite">1</output>
<button type="button" data-inc="${id}" aria-label="Agregar uno más: ${name}"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>
</div>
</div>`;

    function syncCtl(ctl) {
        const q = items[ctl.dataset.ctl] || 0;
        const add = $('.add-btn', ctl);
        const st = $('.stepper', ctl);
        if (!add || !st) return;
        add.hidden = q > 0;
        st.hidden = q === 0;
        $('output', st).textContent = q;
    }

    function renderDrawer() {
        const list = $('#cart-list');
        const cur = ids();
        $('#cart-empty').hidden = cur.length > 0;
        $('#cart-foot').hidden = cur.length === 0;
        list.hidden = cur.length === 0;
        $$('li[data-id]', list).forEach((li) => { if (!items[li.dataset.id]) li.remove(); });
        cur.forEach((id) => {
            const d = dishes[id];
            const q = items[id];
            let li = $(`li[data-id="${id}"]`, list);
            if (!li) {
                li = document.createElement('li');
                li.className = 'cart-item';
                li.dataset.id = id;
                li.innerHTML = `<div><h3></h3><p class="sub"></p></div><p class="line"></p>
<div class="stepper">
<button type="button" data-dec="${id}" aria-label="Quitar uno: ${d.name}"><svg class="i" aria-hidden="true"><use href="#i-minus"/></svg></button>
<output aria-live="polite"></output>
<button type="button" data-inc="${id}" aria-label="Agregar uno más: ${d.name}"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>
</div>`;
                $('h3', li).textContent = d.name;
                list.appendChild(li);
            }
            $('.sub', li).textContent = `${money(d.price)} c/u`;
            $('.line', li).textContent = money(d.price * q);
            $('output', li).textContent = q;
        });
        $('#cart-total').textContent = money(total());
    }

    function renderFormCart() {
        const box = $('#form-cart');
        if (!box) return;
        const n = count();
        box.hidden = n === 0;
        if (n) box.textContent = `Incluiremos tu pedido en el mensaje: ${n} ${n === 1 ? 'platillo' : 'platillos'} por ${money(total())}.`;
    }

    function syncAll() {
        $$('[data-ctl]').forEach(syncCtl);
        $$('.dish').forEach((d) => d.classList.toggle('in-cart', Boolean(items[d.dataset.id])));
        const n = count();
        $$('[data-cart-count]').forEach((el) => {
            const prev = el.textContent;
            el.textContent = n;
            if (el.classList.contains('cart-badge')) {
                el.hidden = n === 0;
                if (n > 0 && String(n) !== prev) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
            }
        });
        $$('[data-cart-total]').forEach((el) => { el.textContent = money(total()); });
        $('#orderbar').hidden = n === 0;
        renderDrawer();
        renderFormCart();
    }

    function set(id, q) {
        if (!dishes[id]) return;
        q = clamp(Math.floor(q), 0, 99);
        const before = items[id] || 0;
        if (q === 0) delete items[id]; else items[id] = q;
        store.set(KEY, items);
        syncAll();
        if (before === 0 && q > 0) {
            toast(`${dishes[id].name} agregado`, { label: 'Ver pedido', run: () => Dialogs.open($('#cart')) });
        }
    }

    function clear() {
        items = {};
        store.set(KEY, items);
        syncAll();
    }

    function message(extra = {}) {
        const out = ['Hola Dhaba, quiero hacer un pedido:', '', ...lines(), '', `Total: ${money(total())}`];
        if (extra.name) out.push('', `Nombre: ${extra.name}`);
        if (extra.notes) out.push(`Notas: ${extra.notes}`);
        return out.join('\n');
    }

    return {
        dish: (id) => dishes[id],
        qty: (id) => items[id] || 0,
        count, total, lines, message, set, clear, syncAll, ctlHtml,
    };
})();

function initCart() {
    const nameEl = $('#cart-name');
    const notesEl = $('#cart-notes');
    nameEl.value = store.get('dhaba:name', '');
    notesEl.value = store.get('dhaba:notes', '');
    nameEl.addEventListener('input', () => store.set('dhaba:name', nameEl.value));
    notesEl.addEventListener('input', () => store.set('dhaba:notes', notesEl.value));

    // Delegación para todos los botones +, stepper y agregar
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add], [data-inc], [data-dec]');
        if (!btn) return;
        const id = btn.dataset.add || btn.dataset.inc || btn.dataset.dec;
        const ctl = btn.closest('[data-ctl]');
        const inDrawer = Boolean(btn.closest('#cart'));
        const q = Cart.qty(id);
        Cart.set(id, btn.hasAttribute('data-dec') ? q - 1 : q + 1);

        // Mantener el foco en algo útil cuando un botón desaparece
        if (ctl) {
            const target = Cart.qty(id) > 0 ? $('[data-inc]', ctl) : $('.add-btn', ctl);
            if (target) target.focus({ preventScroll: true });
        } else if (inDrawer && !Cart.qty(id)) {
            const next = $('#cart-list [data-inc]') || $('#cart [data-close]');
            if (next) next.focus({ preventScroll: true });
        }
    });

    $('#cart-send').addEventListener('click', () => {
        if (!Cart.count()) return;
        openWhatsApp(Cart.message({ name: nameEl.value.trim(), notes: notesEl.value.trim() }));
        toast('Abriendo WhatsApp con tu pedido');
    });
    $('#cart-clear').addEventListener('click', () => {
        Cart.clear();
        toast('Pedido vaciado');
    });
    Cart.syncAll();
}

/* ---------- Menú: filtros por categoría + búsqueda ---------- */
function initMenu() {
    const groups = $$('.menu-group');
    const chips = $$('.chip');
    const search = $('#menu-search');
    const clearBtn = $('#menu-clear');
    const empty = $('#menu-empty');
    let cat = 'all';
    let q = '';

    function apply(animate) {
        const nq = norm(q.trim());
        let shown = 0;
        let k = 0;
        groups.forEach((g) => {
            const inCat = cat === 'all' || g.dataset.cat === cat;
            let vis = 0;
            $$('.dish', g).forEach((d) => {
                const match = inCat && (!nq || d.dataset.hay.includes(nq));
                d.hidden = !match;
                if (!match) return;
                vis += 1;
                if (animate && k < 16 && !reduced()) {
                    d.style.setProperty('--k', k++);
                    d.classList.remove('is-pop');
                    void d.offsetWidth;
                    d.classList.add('is-pop');
                }
            });
            g.hidden = vis === 0;
            const c = $('[data-group-count]', g);
            if (c) c.textContent = `${vis} ${vis === 1 ? 'platillo' : 'platillos'}`;
            shown += vis;
        });
        empty.hidden = shown !== 0;
        clearBtn.hidden = !q;
        chips.forEach((ch) => {
            const on = ch.dataset.cat === cat;
            ch.classList.toggle('is-active', on);
            ch.setAttribute('aria-pressed', String(on));
        });
    }

    function scrollToList() {
        const body = $('#menu-body');
        const tools = $('#menu-tools');
        const header = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 64;
        const y = body.getBoundingClientRect().top + scrollY - (header + 22 + tools.offsetHeight + 18);
        scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
    }

    function setCategory(c, scroll = true) {
        cat = c;
        apply(true);
        const active = chips.find((ch) => ch.dataset.cat === c);
        if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
        if (scroll) scrollToList();
    }

    function setSearch(text, scroll = true) {
        q = text;
        cat = 'all';
        search.value = text;
        apply(true);
        if (scroll) scrollToList();
    }

    chips.forEach((ch) => ch.addEventListener('click', () => setCategory(ch.dataset.cat, true)));

    let timer;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { q = search.value; apply(true); }, 120);
    });
    clearBtn.addEventListener('click', () => { q = ''; search.value = ''; apply(true); search.focus(); });
    $('#menu-reset').addEventListener('click', () => { q = ''; cat = 'all'; search.value = ''; apply(true); });

    // Enlaces de otras secciones que filtran el menú
    document.addEventListener('click', (e) => {
        const f = e.target.closest('[data-filter]');
        const s = e.target.closest('[data-search]');
        if (f) { e.preventDefault(); const dlg = f.closest('dialog'); if (dlg) Dialogs.close(dlg); setCategory(f.dataset.filter, true); }
        else if (s) { e.preventDefault(); setSearch(s.dataset.search, true); }
    });

    apply(false);
}

/* ---------- Formulario de contacto: termina en WhatsApp ---------- */
function initForm() {
    const form = $('#contact-form');
    if (!form) return;
    const nameEl = $('#cf-name');
    const msgEl = $('#cf-msg');
    const btn = $('#cf-submit');
    const setErr = (input, id, text) => {
        $(`#${id}`).textContent = text;
        input.setAttribute('aria-invalid', text ? 'true' : 'false');
    };
    nameEl.value = store.get('dhaba:name', '');
    nameEl.addEventListener('input', () => { if (nameEl.value.trim().length > 1) setErr(nameEl, 'cf-name-err', ''); });
    msgEl.addEventListener('input', () => { if (msgEl.value.trim()) setErr(msgEl, 'cf-msg-err', ''); });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameEl.value.trim();
        const msg = msgEl.value.trim();
        const hasCart = Cart.count() > 0;
        let bad = null;

        if (name.length < 2) { setErr(nameEl, 'cf-name-err', 'Escribe tu nombre para saber con quién hablamos.'); bad = bad || nameEl; }
        else setErr(nameEl, 'cf-name-err', '');
        if (!msg && !hasCart) { setErr(msgEl, 'cf-msg-err', 'Cuéntanos qué necesitas o agrega platillos a tu pedido.'); bad = bad || msgEl; }
        else setErr(msgEl, 'cf-msg-err', '');
        if (bad) { bad.focus(); return; }

        const phone = $('#cf-phone').value.trim();
        const topic = $('#cf-topic').value;
        const out = [`Hola Dhaba, soy ${name}.`, topic + '.'];
        if (phone) out.push(`Mi teléfono: ${phone}`);
        if (msg) out.push('', msg);
        if (hasCart) out.push('', 'Mi pedido:', ...Cart.lines(), '', `Total: ${money(Cart.total())}`);

        store.set('dhaba:name', name);
        btn.classList.add('is-loading');
        btn.disabled = true;
        setTimeout(() => {
            openWhatsApp(out.join('\n'));
            btn.classList.remove('is-loading');
            btn.disabled = false;
            toast('Abriendo WhatsApp con tu mensaje');
        }, reduced() ? 0 : 900);
    });
}


/* ==========================================================================
   ARRANQUE
   Cada módulo corre aislado: si uno falla, el resto de la página sigue viva.
   ========================================================================== */
function boot() {
    root.classList.add('is-loading');

    safe(hydrateConfig);
    safe(initTheme);
    safe(initSplit);
    safe(buildMandala);

    try { initLoader(); } catch (err) { console.error('[Dhaba] initLoader:', err); finishLoad(); }

    safe(initNav);
    safe(initDialogs);
    safe(initReveal);
    safe(initCounters);
    safe(initManifesto);
    safe(initStack);
    safe(initHPan);
    safe(initSteps);
    safe(initFlips);
    safe(initCart);
    safe(initMenu);
    safe(initGallery);
    safe(initForm);
    safe(initHero);
    safe(initEmbers);
    safe(initPointerFx);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
