/* Dans l'application Android, la reconnaissance vocale du navigateur ne marche pas :
   on la remplace par celle du téléphone (pont « AndroidSpeech » fourni par l'appli). */

if (window.AndroidSpeech) {
  const NativeSpeech = {
    current: null,
    result(alternatives) {
      const rec = this.current;
      this.current = null;
      if (!rec) return;
      const list = alternatives.map(text => ({ transcript: text, confidence: 1 }));
      if (rec.onresult) rec.onresult({ results: [list] });
      if (rec.onend) rec.onend();
    },
    error(code) {
      const rec = this.current;
      this.current = null;
      if (!rec) return;
      if (rec.onerror) rec.onerror({ error: code });
      if (rec.onend) rec.onend();
    },
  };

  class NativeRecognition {
    constructor() {
      this.lang = "ar-SA";
      this.maxAlternatives = 5;
      this.interimResults = false;
    }
    start() {
      if (NativeSpeech.current) NativeSpeech.current.abort();
      NativeSpeech.current = this;
      AndroidSpeech.start(this.lang, this.maxAlternatives);
    }
    abort() {
      if (NativeSpeech.current !== this) return;
      NativeSpeech.current = null;
      AndroidSpeech.stop();
    }
    stop() { this.abort(); }
  }

  window.NativeSpeech = NativeSpeech;
  window.SpeechRecognition = window.webkitSpeechRecognition = NativeRecognition;
}
