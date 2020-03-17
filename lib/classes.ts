import * as ifs from './interfaces';

export class NoopDownstreamProvider implements ifs.IDownstreamProvider {
    Initialize(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            console.info('NoopDownstreamProvider: Nothing to initialize.');
            resolve(buildInfo);
        });
    }

    Process(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            console.info('NoopDownstreamProvider: Nothing to process.');
            resolve(buildInfo);
        });
    }

    Finalize(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            console.info('NoopDownstreamProvider: Nothing to finalize.');
            resolve(buildInfo);
        });
    }
}

export class BuildInfo implements ifs.IBuildInfo {
    Description: string = '';
    Company: string = '';
    Copyright: string = '';
    Version: string = '';
    BuildConfiguration: string = '';
    RepositoryUrl: string = '';
    RepositoryRemote: string = 'origin';
    RepositoryBranch: string = 'master';
    AuthorName: string = '';
    AuthorEmail: string = '';
    CommitterName: string = '';
    CommitterEmail: string = '';
    Messages: string[] = [];
    PropertyBag: Object = {};
}
