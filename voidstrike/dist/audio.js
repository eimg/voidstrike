// Short synthesized effects keep audio in sync with the action and work offline.
const weaponTones = {
  pulse: ['triangle', 700, 200, .09, .11],
  spread: ['sawtooth', 480, 120, .10, .075],
  ion: ['sine', 1250, 90, .21, .21],
  arc: ['square', 725, 225, .085, .065]
};

export function createAudio() {
  let context, bus, noise, enabled = true;
  const voices = new Set();

  function unlock() {
    if (!enabled) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        bus = context.createGain();
        bus.gain.value = .22;
        const limiter = context.createDynamicsCompressor();
        bus.connect(limiter).connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 1.3), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio is optional when the browser or device has it disabled. */ }
  }

  function voice(type, start, end, duration, volume, delay = 0) {
    if (!enabled || context?.state !== 'running' || voices.size > 38) return;
    const t = context.currentTime + delay;
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    if (type === 'noise') {
      source.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(start, t);
      filter.frequency.exponentialRampToValueAtTime(end, t + duration);
    } else {
      source.type = type;
      source.frequency.setValueAtTime(start, t);
      source.frequency.exponentialRampToValueAtTime(end, t + duration);
      filter.frequency.value = 3400;
    }
    amp.gain.setValueAtTime(.0001, t);
    amp.gain.exponentialRampToValueAtTime(volume, t + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter).connect(amp).connect(bus);
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); amp.disconnect(); };
    source.start(t);
    source.stop(t + duration + .02);
  }

  function play(name, data = {}) {
    if (!enabled || !context) return;
    if (name === 'shot') {
      const [wave, start, end, duration, level] = weaponTones[data.kind];
      voice(wave, start, end, duration, level / Math.sqrt(data.weaponCount || 1));
    } else if (name === 'kill' || name === 'hit' || name === 'burst') {
      const strong = data.type === 'boss' || name === 'burst';
      voice('noise',strong ? 3500 : 1800,100,strong ? .7 : .24,name === 'hit' ? .45 : .32);
      voice('sine',strong ? 225 : 145,40,strong ? .7 : .23,.40);
    } else if (name === 'pickup') {
      const notes = data.kind === 'life' ? [659,880,1319] : [554,740,1109];
      notes.forEach((f,i) => voice('sine',f,f*1.015,.21,.24,i*.085));
    } else if (['start','stage','won','lost','resume'].includes(name)) {
      const sequence = {start:[220,330,440],stage:[330,440],won:[330,415,494,659],lost:[294,196,123],resume:[440,660]}[name];
      sequence.forEach((f,i) => voice('sine',f,f*1.015,.21,.24,i*.085));
    }
  }

  function setEnabled(value) {
    enabled = value;
    if (enabled) unlock();
    if (bus) bus.gain.setTargetAtTime(enabled ? .22 : 0, context.currentTime, .015);
  }
  return {unlock, play, setEnabled};
}
