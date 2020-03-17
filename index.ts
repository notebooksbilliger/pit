import 'colors';
import ignore from 'ignore';
import * as os from 'os';
import * as fs from "fs-extra";
import * as path from 'path';
import * as glob from 'glob-gitignore';
import * as ifs from './lib/interfaces';
import * as cls from './lib/classes';
import * as tsjson from '@nbb.com/ts-json-loader';
import btools from '@nbb.com/npmbuildtools';

async function downstreamRepo(folderPath: string, build: ifs.IBuildInfo): Promise<void> {
    var licenseFile: string = '';
    var licenseText : string = CopyrightPlaceholder;
    var readmeFile: string = '';
    var readmeText : string = 'Clone this repository with <code>git clone ' + RepositoryPlaceholder + '</code>';
    var versionFile: string = '';

    fs.readdirSync(folderPath).forEach(function(item: string)  {
        var itemName = path.join(folderPath, item);
        if (!fs.lstatSync(itemName).isDirectory()) {
            switch (item.toUpperCase())
            {
                case 'LICENSE':
                    licenseFile = itemName;
                    licenseText = fs.readFileSync(licenseFile, {  encoding: 'UTF-8'});
                    console.info(`Updating '${licenseFile}'`);
                    break;
                case 'README.MD':
                    readmeFile = itemName;
                    readmeText = fs.readFileSync(readmeFile, {  encoding: 'UTF-8'});
                    console.info(`Updating '${readmeFile}'`);
                    break;
                case 'VERSION':
                    versionFile = itemName;
                    var version: string = fs.readFileSync(versionFile, {  encoding: 'UTF-8'});
                    console.info(`Updating '${versionFile}' (from [${version}] to [${build.Version}])`);
                    break;
            }
        }
    })

    if (!versionFile) {
        versionFile = path.join(folderPath, 'VERSION');
        console.info(`Creating '${versionFile}' (with [${build.Version}])`);
    }
    fs.writeFileSync(versionFile, build.Version);

    if (!readmeFile) {
        readmeFile = path.join(folderPath, 'README.md');
        console.info(`Creating '${readmeFile}'`);
    }
    readmeText = readmeText.replace(RepositoryPlaceholder, build.RepositoryUrl);
    readmeText = readmeText.replace(PitCmdPlaceholder, `git clone --git-dir:./.pit ${build.RepositoryUrl}`);
    fs.writeFileSync(readmeFile, readmeText);

    if (!licenseFile) {
        licenseFile = path.join(folderPath, 'LICENSE');
        console.info(`Creating '${licenseFile}'`);
    }
    licenseText = licenseText.replace(CopyrightPlaceholder, build.Copyright);
    fs.writeFileSync(licenseFile, licenseText);
}

async function downstream(upstreamFolder: string, downstreamFolder: string, buildInfo: ifs.IBuildInfo | string, consoleOptions?: btools.ConsoleOptions): Promise<void> {
    if (!fs.existsSync(upstreamFolder)) { throw Error(`Upstream folder '${upstreamFolder}' doesn't exist.`); }
    if (!fs.existsSync(downstreamFolder)) { throw Error(`Downstream folder '${downstreamFolder}' doesn't exist.`); }

    var provider = (await import('@nbb.com/npmbuildtools/lib/vc-utils')).GetVersionControlProvider(downstreamFolder);
    var downstreamProvider: ifs.IDownstreamProvider;
    switch (provider)
    {
        case 'git':
            downstreamProvider = new (await import('./lib/git')).GitDownstreamProvider();
            break;
        default:
            downstreamProvider = new cls.NoopDownstreamProvider();
            console.warn(`Version control provider [${provider}] is not supported, performing plain directory downstream.`);
            break;
    }
    console.info(`Using version control provider [${provider}].`);

    var build: cls.BuildInfo;
    if (typeof(buildInfo) === 'string') {
        if (!fs.existsSync(buildInfo)) { throw `File '${buildInfo}' could not be found.` }
        build = tsjson.Load(buildInfo, new cls.BuildInfo, { failOnFileNotFound: true, failOnObjectIsDefault: true, writeOnLoad: tsjson.WriteOnLoad.None, consoleOptions: consoleOptions });
    } else {
        build = buildInfo;
    }
    console.debug('Build info:\n' + JSON.stringify(build, null, 4));

    var temp: string = '';

    console.info('Creating temporary working folder ...\b');
    try {
        temp = fs.mkdtempSync(path.join(os.tmpdir(), "pit_temp_"));
        console.info('\bok.');
        console.debug(`Temporary working folder is '${temp}'.`);
    } catch(err) {
        console.info(`\b${'failed!'.red}`);
        throw err;
    }

    console.info(`Copying downstream folder '${downstreamFolder}' to temporary working folder ...\b`);
    try {
        fs.copySync(downstreamFolder, temp, { overwrite: true }); // recursive ?
        console.info('\bok.');
    } catch(err) {
        console.info(`\b${'failed!'.red}`);
        throw err;
    }

    try {
        console.info(`Initializing downstream target version control (provider: ${provider}).`);
        await downstreamProvider.Initialize(temp, build).then(async (buildInfo) => {
            console.info(`Initializing downstream target version control completed successfully.`);

            console.info(`Creating list of files to copy from upstream folder.`);
            var ignoreFileName = '.pitignore';
            var files: string[];
            var allFiles = files = glob.sync('**/*', { cwd: upstreamFolder, nodir: true, dot: true });
            if (!allFiles.includes(ignoreFileName)) {
                files = allFiles;
                console.warn(`There was no ignore file found, performing ${`full`.bold} copy (${files.length} file(s) total).`);
            } else {
                files = glob.sync('**', { cwd: upstreamFolder, nodir: true, dot: true, ignore: ignore().add(fs.readFileSync(path.resolve(upstreamFolder, ignoreFileName)).toString())});
                files = files.filter(value => (value != ignoreFileName));
            }

            console.info(`Merging ${files.length} file(s) from upstream folder '${upstreamFolder}' to temporary working folder.`);
            try {
                files.forEach(file => {
                    var src = path.resolve(upstreamFolder, file);
                    var dst = path.resolve(temp, file);
                    console.debug(`Copying file '${src}' to '${dst}' ... \b`);
                    fs.ensureDirSync(path.dirname(dst));
                    fs.copyFileSync(src, dst);
                    console.debug('\bok.');
                });
            } catch (err) {
                console.debug(`\b${'failed!'.red}`);
                throw err;
            }
    
            console.info(`Processing downstream target version control (provider: ${provider}).`);
            await downstreamProvider.Process(temp, buildInfo).then(async (buildInfo) => {
                console.info(`Processing downstream target version control completed successfully.`);

                console.info(`Processing downstream target.`);
                await downstreamRepo(temp, buildInfo).then(async () => {
                    console.info(`Processing downstream target completed successfully.`);

                    console.info(`Finalizing downstream target version control (provider: ${provider}).`);
                    await downstreamProvider.Finalize(temp, buildInfo).then(buildInfo => {
                        console.info(`Finalizing downstream target version control completed successfully.`);
                    });
                });
            });
        });
    } catch(err) {
        console.warn('An error has ocurred, aborting downstream.');
        throw err;
    } finally {
        console.info(`Cleaning up temporary working folder '${temp}' ...\b`);
        await fs.remove(temp).then(() => {
            console.info('\bok.');
            console.debug(`Temporary working folder '${temp}' has been removed sucessfully.`);
        }).catch(reason => {
            console.info(`\b${'failed!'.red}`);
            console.error(`Error while cleaning up temporary working folder '${temp}': ${reason}`);
        });
    }
}

//#region Exports
export const CopyrightPlaceholder: string = '\\<copyright>';
export const RepositoryPlaceholder: string = '\\<repository>';
export const PitCmdPlaceholder: string = '\\<pitcmd>';

export async function Downstream(upstreamFolder: string, downstreamFolder: string, buildInfo: cls.BuildInfo | string, consoleOptions?: btools.ConsoleOptions): Promise<void> {
    consoleOptions = btools.ConsolePushOptions(consoleOptions);
    try {
        await downstream(upstreamFolder, downstreamFolder, buildInfo, consoleOptions).catch(err => { throw err; });
    } finally {
        btools.ConsolePopOptions();
    }
}
//#endregion
