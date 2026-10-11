"use strict";
const $ = id => document.getElementById(id);
const daysEl = $("days"), hoursEl = $("hours"), minutesEl = $("minutes"), secondsEl = $("seconds");
const timezoneSelect = $("timezone"), clockEl = $("local-clock"), targetDateEl = $("target-date");
const celebrationEl = $("celebration"), countdownEl = $("countdown");
const soundButton = $("sound-toggle"), replayButton = $("replay-fireworks");
const canvas = $("fireworks"), ctx = canvas.getContext("2d");

let selectedZone = "Asia/Dhaka", targetTimestamp = 0, celebrating = false, soundEnabled = false;
let audioContext = null, lastSoundTime = 0, particles = [], rockets = [], lastFrame = 0, lastAutoBurst = 0;

const pad = n => String(n).padStart(2, "0");

function offsetLabel(zone) {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
            .formatToParts(new Date(Date.UTC(2027, 0, 1)))
            .find(p => p.type === "timeZone").value;
    } catch (e) { return ""; }
}

function populateZones() {
    let zones = [];
    try { zones = Intl.supportedValuesOf("timeZone").slice(); }
    catch (e) {
        zones = ["Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "America/Chicago", "America/Denver",
            "America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Asia/Dhaka", "Asia/Dubai",
            "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Europe/Paris",
            "Pacific/Auckland"];
    }
    if (!zones.includes("UTC")) zones.unshift("UTC");
    if (!zones.includes("Asia/Dhaka")) zones.push("Asia/Dhaka");
    const frag = document.createDocumentFragment();
    zones.forEach(z => {
        const o = document.createElement("option");
        o.value = z;
        const off = offsetLabel(z);
        o.textContent = z.replace(/_/g, " ") + (off ? " (" + off + ")" : "");
        frag.appendChild(o);
    });
    timezoneSelect.appendChild(frag);
    timezoneSelect.value = "Asia/Dhaka";
}

function getZoneParts(date, zone) {
    const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    const parts = {};
    for (const p of f.formatToParts(date)) { if (p.type !== "literal") parts[p.type] = Number(p.value); }
    return parts;
}

function zonedMidnightToUTC(year, month, day, zone) {
    const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
    let guess = desired;
    for (let i = 0; i < 4; i++) {
        const p = getZoneParts(new Date(guess), zone);
        guess += desired - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    }
    return guess;
}

function formatTargetDate(zone) {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "long", day: "numeric", year: "numeric" })
        .format(new Date(targetTimestamp));
}

function updateTarget() {
    selectedZone = timezoneSelect.value;
    targetTimestamp = zonedMidnightToUTC(2027, 1, 1, selectedZone);
    targetDateEl.textContent = formatTargetDate(selectedZone).toUpperCase() + " · 12:00 AM";
    celebrating = false;
    celebrationEl.classList.add("hidden");
    countdownEl.classList.remove("hidden");
    updateClockAndCountdown();
}

function updateClockAndCountdown() {
    const now = Date.now();
    clockEl.textContent = new Intl.DateTimeFormat("en-GB", {
        timeZone: selectedZone, hour: "2-digit",
        minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).format(new Date(now));
    const remaining = targetTimestamp - now;
    if (remaining <= 0) {
        daysEl.textContent = "000"; hoursEl.textContent = "00"; minutesEl.textContent = "00"; secondsEl.textContent = "00";
        if (!celebrating) {
            celebrating = true;
            countdownEl.classList.add("hidden");
            celebrationEl.classList.remove("hidden");
            startCelebration();
        }
        return;
    }
    const t = Math.floor(remaining / 1000);
    daysEl.textContent = String(Math.floor(t / 86400)).padStart(3, "0");
    hoursEl.textContent = pad(Math.floor((t % 86400) / 3600));
    minutesEl.textContent = pad(Math.floor((t % 3600) / 60));
    secondsEl.textContent = pad(t % 60);
}

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const colors = ["#6df7ff", "#b68aff", "#ffffff", "#ff77cf", "#ffe879"];

function launchRocket() {
    rockets.push({
        x: Math.random() * window.innerWidth * .8 + window.innerWidth * .1,
        y: window.innerHeight + 5,
        targetY: window.innerHeight * (.15 + Math.random() * .4),
        speed: 4 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * 5)]
    });
}

function burst(x, y, color, count = 55) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4.5;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 45 + Math.random() * 40, size: 1 + Math.random() * 2.2, color });
    }
    if (particles.length > 1800) particles.splice(0, particles.length - 1800);
    playPop();
}

function playPop() {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    if (now - lastSoundTime < .16) return;
    lastSoundTime = now;
    try {
        const o = audioContext.createOscillator(), g = audioContext.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(520 + Math.random() * 850, now);
        o.frequency.exponentialRampToValueAtTime(180, now + .18);
        g.gain.setValueAtTime(.045, now);
        g.gain.exponentialRampToValueAtTime(.001, now + .2);
        o.connect(g); g.connect(audioContext.destination);
        o.start(now); o.stop(now + .21);
    } catch (e) { console.warn("Sound could not be played.", e); }
}

function animate(ts) {
    if (!document.hidden && ts - lastFrame > 28) {
        lastFrame = ts;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (ts - lastAutoBurst > (celebrating ? 240 : 1500)) {
            lastAutoBurst = ts;
            launchRocket();
            if (celebrating && Math.random() > .35) launchRocket();
        }
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.y -= r.speed;
            ctx.globalAlpha = .9; ctx.fillStyle = r.color; ctx.shadowBlur = 12; ctx.shadowColor = r.color;
            ctx.beginPath(); ctx.arc(r.x, r.y, 2, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            if (r.y <= r.targetY) { burst(r.x, r.y, r.color, celebrating ? 90 : 48); rockets.splice(i, 1); }
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += .035; p.vx *= .985; p.vy *= .985; p.life--;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.min(1, p.life / 25);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    requestAnimationFrame(animate);
}

function startCelebration() { launchRocket(); launchRocket(); launchRocket(); }

function celebrateAgain() {
    for (let i = 0; i < 5; i++)launchRocket();
    burst(window.innerWidth / 2, window.innerHeight * .28, "#6df7ff", 100);
}

async function toggleSound() {
    if (!soundEnabled) {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { alert("Your browser does not support generated audio."); return; }
            if (!audioContext) audioContext = new AC();
            if (audioContext.state === "suspended") await audioContext.resume();
            soundEnabled = true;
            soundButton.textContent = "Sound: ON";
            soundButton.setAttribute("aria-pressed", "true");
            playPop();
        } catch (e) {
            soundEnabled = false;
            soundButton.textContent = "Sound: OFF";
            soundButton.setAttribute("aria-pressed", "false");
        }
    } else {
        soundEnabled = false;
        soundButton.textContent = "Sound: OFF";
        soundButton.setAttribute("aria-pressed", "false");
    }
}

timezoneSelect.addEventListener("change", updateTarget);
soundButton.addEventListener("click", toggleSound);
replayButton.addEventListener("click", celebrateAgain);
window.addEventListener("resize", resizeCanvas);
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateClockAndCountdown(); });

populateZones();
resizeCanvas();
updateTarget();
setInterval(updateClockAndCountdown, 250);
requestAnimationFrame(animate);