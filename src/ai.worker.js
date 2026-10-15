import { analyze } from './ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: analyze(data.game, data.level, data.analysis) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
