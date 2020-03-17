export interface IBuildInfo {
    Description: string;
    Company: string;
    Copyright: string;
    Version: string;
    BuildConfiguration: string;
    RepositoryUrl: string;
    RepositoryRemote: string;
    RepositoryBranch: string;
    AuthorName: string;
    AuthorEmail: string;
    CommitterName: string;
    CommitterEmail: string;
    Messages: string[];
    PropertyBag: Object;
}

export interface IDownstreamProvider {
    Initialize(downstreamFolder: string, buildInfo: IBuildInfo): Promise<IBuildInfo>;
    Process(downstreamFolder: string, buildInfo: IBuildInfo): Promise<IBuildInfo>;
    Finalize(downstreamFolder: string, buildInfo: IBuildInfo): Promise<IBuildInfo>;
}
