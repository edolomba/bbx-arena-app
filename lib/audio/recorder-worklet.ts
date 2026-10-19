/**
 * AudioWorklet that captures raw Float32 PCM from the mic, untouched.
 * This replaces MediaRecorder, whose output codec and bitrate the browser
 * chooses for you (often low-bitrate Opus tuned for speech).
 *
 * Inlined as a string so it can be loaded from a Blob URL without extra
 * bundler config. Frames are batched (default 4096) to keep message traffic low.
 */
export const RECORDER_WORKLET_SOURCE = /* js */ `
class BbxRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.batch = (options.processorOptions && options.processorOptions.batchFrames) || 4096;
    this.recording = false;
    this.buffers = null;
    this.filled = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.recording = true;
        this.buffers = null;
        this.filled = 0;
      } else if (e.data.type === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  flush() {
    if (!this.buffers || this.filled === 0) return;
    const chans = this.buffers.map((b) => b.slice(0, this.filled));
    this.port.postMessage({ type: 'chunk', chans }, chans.map((c) => c.buffer));
    this.buffers = null;
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!this.recording || !input || input.length === 0) return true;
    if (!this.buffers) this.buffers = input.map(() => new Float32Array(this.batch));
    const frames = input[0].length;
    for (let c = 0; c < this.buffers.length; c++) {
      this.buffers[c].set(input[c] || input[0], this.filled);
    }
    this.filled += frames;
    if (this.filled + frames > this.batch) this.flush();
    return true;
  }
}
registerProcessor('bbx-recorder', BbxRecorder);
`;
