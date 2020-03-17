import * as fs from 'fs-extra';
import * as path from 'path';
import * as assert from 'assert';
import * as tsjson from '@nbb.com/ts-json-loader';
import * as pit from '../index';
import btools from '@nbb.com/npmbuildtools';
const thisPackage = require('../package.json');

if (btools.TerminalCanBlock) {
    console.log('\u001b[2J'); // clear screen
}
if (!fs.existsSync(`${__filename}.map`)) {
    console.error(`There is no source map for this suite, so you won't be able to debug it! To change this, turn on the 'sourceMap' typescript compiler option in your 'tsconfig.json' file.`);
}

console.log('Running Mocha Test Suite ...');

describe(`${thisPackage.name} Downstream() tests`, function() {
    it(`Downstream() should succeed`, async function() {
        class DownstreamTestSettings {
            UpstreamFolder: string = 'The path to the parent repository.';
            DownstreamFolder: string = 'The path to the child repository.';
            BuildInfo: string = 'JSON string or path to a UTF-8 encoded JSON file.';
        }

        var pathSpec = path.join(path.dirname(__filename), path.basename(__filename, path.extname(__filename))) + '.json';
        var settings = new DownstreamTestSettings();
        btools.ConsoleCaptureStart();
        try {
            settings = tsjson.Load(pathSpec, new DownstreamTestSettings(), { writeOnLoad: tsjson.WriteOnLoad.Create, failOnFileNotFound: true, consoleOptions: { logLevel: 'debug' } });
            btools.ConsoleCaptureStop();
        } catch(err) {
            btools.ConsoleCaptureStop();
            throw err;
        }

        btools.ConsoleCaptureStart();
        await pit.Downstream(settings.UpstreamFolder, settings.DownstreamFolder, settings.BuildInfo, { logLevel: 'debug' }).catch(err => {
            btools.ConsoleCaptureStop();
            throw err;
        }).then(() => {
            btools.ConsoleCaptureStop();
            assert.ok(btools.stdout.length > 0, `stdout should contain lines`);
            assert.equal(btools.stderr.length, 0, `stderr shouldn't contain any lines:\n${btools.stderr.toString()}`);
        });
    });
});

describe(`${thisPackage.name} Readme should be up to date`, function() {
    it('CheckReadme() should succeed', function(done) {
        var packagePath = path.resolve('.');
        var readmeFileName = 'README.adoc';

        var result;
        btools.ConsoleCaptureStart();
        try {
            result = btools.CheckReadme(packagePath, readmeFileName, { updateTimestamp: false });
            btools.ConsoleCaptureStop();
        } catch(err) {
            btools.ConsoleCaptureStop();
            throw err;
        }

        if (result) {
            assert.fail(`Readme file '${path.join(packagePath, readmeFileName)}' needs to be updated:\n${result}`);
        }

        done();
    });
});
