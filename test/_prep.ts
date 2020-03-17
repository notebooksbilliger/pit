import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as cls from '../lib/classes';

export function Prepare() {

    var tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), '_prep-'));

    var upstreamFolder = path.join(tempFolder, 'upstream');
    fs.ensureDirSync(upstreamFolder);
    var downstreamFolder = path.join(tempFolder, 'downstream');
    fs.ensureDirSync(downstreamFolder);
    var buildInfoFile = path.join(tempFolder, 'build.json');

    var buildInfo = new cls.BuildInfo();
    buildInfo.Version = "1.2.3.4";
    buildInfo.Copyright = "Copyright © 2020";
    fs.writeJSONSync(buildInfoFile, buildInfo, { EOL: os.EOL, spaces: 4, encoding: 'utf8' });

    var testSettings = {};
    // @ts-ignore
    testSettings.UpstreamFolder = upstreamFolder;
    // @ts-ignore
    testSettings.DownstreamFolder = downstreamFolder;
    // @ts-ignore
    testSettings.BuildInfo = buildInfoFile;
    fs.writeJSONSync(path.join(path.dirname(__filename), '_suite.json'), testSettings, { EOL: os.EOL, spaces: 4, encoding: 'utf8' });
}