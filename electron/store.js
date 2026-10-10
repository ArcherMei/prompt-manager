import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class Store {
  constructor(opts) {
    const userDataPath = app.getPath('userData');
    this.path = path.join(userDataPath, opts.configName + '.json');
    this.data = parseDataFile(this.path, opts.defaults);
  }

  get(key) {
    if (!key) return this.data;
    return this.data[key];
  }

  set(val) {
    this.data = val;
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
}

function parseDataFile(filePath, defaults) {
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch(error) {
    return defaults;
  }
}
