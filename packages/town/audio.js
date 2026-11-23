// Original lo-fi arrangements synthesized in the browser.
const button = document.getElementById('sound');
const tracks = [
  {
    id: 'evening', name: 'Maple Evening', bpm: 72,
    chords: [[53,57,60,64],[50,53,57,60],[48,52,55,59],[43,50,53,57]],
    melody: [72,0,69,0,67,0,64,0,69,0,65,67,0,64,0,0],
    bass: [0,4], brushes: [2,6], roll: .022, lead: 'triangle',
  },
  {
    id: 'rain', name: 'Rain on Market Lane', bpm: 65,
    chords: [[50,53,57,60,64],[46,53,57,60],[41,48,52,57],[48,52,55,62],
      [50,53,57,60],[43,50,53,57],[46,53,57,60],[45,52,55,61]],
    melody: [
      0,76,0,72,0,69,0,0, 72,0,69,0,65,0,0,0, 0,72,0,69,0,67,0,64, 67,0,0,62,0,64,0,0,
      69,0,0,72,0,77,0,0, 74,0,0,72,69,0,0,0, 0,69,0,65,0,60,0,0, 67,0,0,64,0,61,0,0,
    ],
    bass: [0], brushes: [2,5,7], roll: .037, lead: 'sine',
  },
  {
    id: 'market', name: 'Saturday Market', bpm: 84,
    chords: [[48,52,55,59],[45,52,55,60],[50,53,57,60],[43,50,53,59],
      [48,52,55,57],[52,55,59,62],[41,48,52,57],[43,50,57,59]],
    melody: [
      76,0,79,0,76,74,0,72, 0,76,0,72,0,69,0,0, 77,0,76,74,0,72,0,69, 0,71,0,74,0,72,0,0,
      69,0,72,0,76,0,79,0, 0,79,0,76,74,0,71,0, 72,0,69,0,65,0,67,0, 69,0,71,0,74,0,71,0,
    ],
    bass: [0,3,6], brushes: [2,6], roll: .017, lead: 'triangle',
  },
  {
    id: 'waterfront', name: 'Waterfront Dawn', bpm: 60,
    chords: [[45,52,56,59],[42,49,52,57],[50,57,61,64],[40,47,54,56],
      [45,52,57,59],[37,44,47,52],[50,54,57,64],[40,47,56,61]],
    melody: [
      0,0,73,0,0,76,0,0, 0,73,0,69,0,0,0,0, 0,76,0,0,73,0,0,69, 0,71,0,68,0,0,0,0,
      0,0,76,0,0,81,0,0, 0,76,0,73,0,0,0,0, 0,78,0,0,76,0,0,69, 0,73,0,71,0,68,0,0,
    ],
    bass: [0,5], brushes: [6], roll: .075, lead: 'sine',
  },
  {
    id: 'lanterns', name: 'Lanterns in Guild Row', bpm: 76,
    chords: [[45,48,52,55],[41,48,52,55],[48,52,55,62],[43,50,53,57],
      [45,48,52,59],[50,53,57,60],[41,48,52,57],[40,47,50,56]],
    melody: [
      72,0,0,67,69,0,0,64, 0,69,0,67,0,64,0,0, 74,0,72,0,67,0,0,0, 0,69,0,67,0,62,64,0,
      76,0,0,72,71,0,0,67, 0,74,0,72,0,69,0,0, 72,0,69,0,65,0,0,0, 0,68,0,64,0,62,0,0,
    ],
    bass: [0,4,7], brushes: [2,4,6], roll: .032, lead: 'triangle',
  },
];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
let audio, master, trackBus, noise, timer, nextBeat, step = 0;

function preference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
let enabled = preference('maple-music', 'on') !== 'off';
let track = tracks.find(item => item.id === preference('maple-track', 'evening')) ?? tracks[0];
const settings = document.getElementById('music-settings');
const picker = document.getElementById('music-track');
const volume = document.getElementById('music-volume');
for (const item of tracks) picker.add(new Option(item.name, item.id));
picker.value = track.id;
volume.value = preference('maple-volume', '.35');
picker.onchange = () => {
  track = tracks.find(item => item.id === picker.value) ?? tracks[0];
  remember('maple-track', track.id);
  step = 0;
  if (audio) {
    // Scheduled notes finish on the old bus while the new loop starts quietly.
    const previous = trackBus;
    previous.gain.setTargetAtTime(0, audio.currentTime, .025);
    setTimeout(() => previous.disconnect(), 140);
    connectTrack();
    syncPlayback();
  }
};
volume.oninput = () => {
  if (master) master.gain.setTargetAtTime(Number(volume.value) * .38, audio.currentTime, .04);
  remember('maple-volume', volume.value);
};
function connectTrack() {
  trackBus = audio.createGain();
  trackBus.gain.setValueAtTime(0, audio.currentTime);
  trackBus.gain.setTargetAtTime(1, audio.currentTime, .04);
  trackBus.connect(master);
}
function tone(midi, at, length, amplitude, shape = 'triangle') {
  const source = audio.createOscillator(), env = audio.createGain();
  source.type = shape; source.frequency.value = frequency(midi);
  env.gain.setValueAtTime(.0001, at);
  env.gain.exponentialRampToValueAtTime(amplitude, at + .028);
  env.gain.exponentialRampToValueAtTime(.0001, at + length);
  source.connect(env).connect(trackBus);
  source.start(at); source.stop(at + length + .02);
}
function brush(at) {
  const source = audio.createBufferSource(), env = audio.createGain();
  source.buffer = noise;
  env.gain.setValueAtTime(.035, at); env.gain.exponentialRampToValueAtTime(.0001, at + .09);
  source.connect(env).connect(trackBus); source.start(at);
}
function schedule() {
  if (!enabled || audio.state !== 'running') return;
  const beat = 60 / track.bpm;
  const loopSteps = track.chords.length * 8;
  if (nextBeat < audio.currentTime) nextBeat = audio.currentTime + .03;
  while (nextBeat < audio.currentTime + .25) {
    const chord = track.chords[Math.floor(step / 8)];
    const inBar = step % 8;
    if (inBar === 0) chord.forEach((note,i) => tone(note, nextBeat + i*track.roll, beat*3.3, .12));
    if (track.bass.includes(inBar)) tone(chord[0]-12, nextBeat, beat*1.1, .18, 'sine');
    if (track.brushes.includes(inBar)) brush(nextBeat);
    const note = track.melody[step % track.melody.length];
    if (note) tone(note, nextBeat+.045, beat*.74, .067, track.lead);
    nextBeat += beat/2;
    step = (step + 1) % loopSteps;
  }
}
function display() {
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'Mute' : 'Sound';
  button.title = enabled && audio?.state !== 'running'
    ? 'Music starts when you interact with the town' : enabled ? 'Mute music' : 'Play music';
}
function syncPlayback() {
  clearInterval(timer);
  if (enabled && audio?.state === 'running') {
    nextBeat = audio.currentTime + .05;
    schedule();
    timer = setInterval(schedule, 100);
  }
  display();
}
function startMusic() {
  if (!enabled || audio?.state === 'running') return;
  try {
    if (!audio) {
      audio=new AudioContext(); master=audio.createGain(); master.connect(audio.destination);
      connectTrack();
      noise=audio.createBuffer(1,Math.floor(audio.sampleRate*.1),audio.sampleRate);
      const samples=noise.getChannelData(0); let seed=51, previous=0;
      for(let i=0;i<samples.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        previous=previous*.66+(seed/2147483648-1)*.34; samples[i]=previous;
      }
      master.gain.value = Number(volume.value) * .38;
      audio.onstatechange = syncPlayback;
      if (audio.state === 'running') syncPlayback();
    }
    if (audio.state !== 'running') audio.resume().catch(display);
  } catch {
    button.title = 'Audio unavailable in this browser';
  }
}
button.onclick = () => {
  enabled = !enabled;
  remember('maple-music', enabled ? 'on' : 'off');
  if (enabled) startMusic();
  else {
    clearInterval(timer);
    if (audio) audio.suspend().catch(display);
  }
  display();
};
function unlockMusic(event) {
  if (event.target !== button) startMusic();
}
document.addEventListener('click', unlockMusic, true);
document.addEventListener('keydown', unlockMusic, true);
document.addEventListener('click', event => {
  if (settings.open && !settings.contains(event.target)) settings.open = false;
});
settings.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !settings.open) return;
  event.stopPropagation();
  settings.open = false;
  settings.querySelector('summary').focus();
});
display();
startMusic();
