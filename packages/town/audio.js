// A local, original electric-piano and brush loop. No requests or simulation ticks.
const button = document.getElementById('sound');
const chords = [[53,57,60,64],[50,53,57,60],[48,52,55,59],[43,50,53,57]];
const melody = [72,0,69,0,67,0,64,0,69,0,65,67,0,64,0,0];
const beat = 60 / 72;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
let audio, master, noise, timer, nextBeat, step;
let enabled = true;
try { enabled = localStorage.getItem('maple-music') !== 'off'; } catch {}
function preference() {
  try { return Number(localStorage.getItem('maple-volume') ?? .35); } catch { return .35; }
}
const volume = document.createElement('input');
volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.01';
volume.value = String(preference());
volume.setAttribute('aria-label','Music volume');
volume.title = 'Music volume';
volume.style.width = '64px';
volume.hidden = true;
button.after(volume);
volume.oninput = () => {
  if (master) master.gain.setTargetAtTime(Number(volume.value) * .38, audio.currentTime, .04);
  try { localStorage.setItem('maple-volume', volume.value); } catch {}
};
function tone(midi, at, length, amplitude, shape = 'triangle') {
  const source = audio.createOscillator(), env = audio.createGain();
  source.type = shape; source.frequency.value = frequency(midi);
  env.gain.setValueAtTime(.0001, at);
  env.gain.exponentialRampToValueAtTime(amplitude, at + .028);
  env.gain.exponentialRampToValueAtTime(.0001, at + length);
  source.connect(env).connect(master);
  source.start(at); source.stop(at + length + .02);
}
function brush(at) {
  const source = audio.createBufferSource(), env = audio.createGain();
  source.buffer = noise;
  env.gain.setValueAtTime(.035, at); env.gain.exponentialRampToValueAtTime(.0001, at + .09);
  source.connect(env).connect(master); source.start(at);
}
function schedule() {
  if (!enabled || audio.state !== 'running') return;
  if (nextBeat < audio.currentTime) nextBeat = audio.currentTime + .03;
  while (nextBeat < audio.currentTime + .25) {
    const chord = chords[Math.floor(step / 8) % chords.length];
    if (step % 8 === 0) chord.forEach((note,i) => tone(note, nextBeat + i*.022, beat*3.3, .12));
    if (step % 4 === 0) tone(chord[0]-12, nextBeat, beat*1.1, .18, 'sine');
    if (step % 4 === 2) brush(nextBeat);
    if (melody[step%16]) tone(melody[step%16], nextBeat+.045, beat*.74, .067);
    nextBeat += beat/2; step++;
  }
}
function display() {
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'Mute' : 'Sound';
  button.title = enabled && audio?.state !== 'running'
    ? 'Music starts when you interact with the town' : enabled ? 'Mute music' : 'Play music';
  volume.hidden = !enabled;
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
      noise=audio.createBuffer(1,Math.floor(audio.sampleRate*.1),audio.sampleRate);
      const samples=noise.getChannelData(0); let seed=51, previous=0;
      for(let i=0;i<samples.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        previous=previous*.66+(seed/2147483648-1)*.34; samples[i]=previous;
      }
      step=0;
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
  try { localStorage.setItem('maple-music', enabled ? 'on' : 'off'); } catch {}
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
display();
startMusic();
