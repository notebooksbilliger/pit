import * as os from 'os';
import * as fs from "fs-extra";
import * as path from 'path';
import * as ifs from './interfaces';
import * as cls from './classes';
import { Repository, Reference, Signature, Config, Checkout } from 'nodegit';

export class GitPropertyBag {
    repo: Repository;
    constructor(repo: Repository) {
        this.repo = repo;
    }
}
export enum SignatureType {
    Unknown = 0,
    Author = 1,
    Committer = 2
}

export class Signatures {
    Author: Signature | undefined
    Committer: Signature | undefined
}

async function FindConfigurationValue(configurations: [Config, string][], prefixes: string[], suffixes: string[]): Promise<string> {
    var result: string = '';

    for (const suffix of suffixes) {
        for (const prefix of prefixes) {
            for (const config of configurations) {
                var name: string = `${prefix}.${suffix}`;
                await config[0].getStringBuf(name).then(buf => {
                    console.debug(`config value '${name}' was found in configuration '${config[1]}'.`);
                    result = <string><unknown>buf;
                }).catch(reason => {
                    console.debug((<Error>reason).message + ` in configuration '${config[1]}'.`);
                });
                if (result) { break; }
            }
            if (result) { break; }
        }
        if (result) { break; }
    }

    return result;
}

async function GetSignature(build: ifs.IBuildInfo, type: SignatureType, repo?: Repository): Promise<Signature | undefined> {

    var prefixes: string[] = [];
    var email: string = '';
    var name: string = '';

    switch (type)
    {
        case SignatureType.Unknown:
            break;
        case SignatureType.Author:
            prefixes.push('author');
            email = build.AuthorEmail;
            name = build.AuthorName;
            break;
        case SignatureType.Committer:
            prefixes.push('committer');
            email = build.CommitterEmail;
            name = build.CommitterName;
            break;
        default:
            throw Error(`Unsupported signature type [${SignatureType[type]}].`);
    }
    prefixes.push('user');

    var configs: [Config, string][] = [];
    if (repo instanceof Repository) {
        await repo.config().then(config => {
            configs.push([config, 'repo']);
        }).catch(reason => {
            throw Error(reason);
        });
    }

    await Config.openDefault().then(config => {
        configs.push([config, 'default']);
    }).catch(reason => {
        throw Error(reason);
    });

    if (!email) {
        await FindConfigurationValue(configs, prefixes, ['email']).then(buf => {
            email = buf;
        }).catch(reason => {
            console.log(reason);
        });
    }
    if (!email) { return undefined; }

    if (!name) {
        await FindConfigurationValue(configs, prefixes, ['name']).then(buf => {
            name = buf;
        }).catch(reason => {
            console.log(reason);
        });
    }
    if (!name) { name = email.split('@')[0] }

    return Signature.now(name, email);
}

async function GetSignatures(build: ifs.IBuildInfo, repo?: Repository): Promise<Signatures> {
    var signatures: Signatures = new Signatures();
    await GetSignature(build, SignatureType.Author, repo).then(s => {
        signatures.Author = s;
    }).catch(reason => {
        throw reason;
    });
    await GetSignature(build, SignatureType.Committer, repo).then(s => {
        signatures.Committer = s;
    }).catch(reason => {
        throw reason;
    });

    if (!signatures.Author) {
        if (!signatures.Committer) {
            throw Error('Unable to create both, an author and a committer signature.');
        } else {
            console.debug('Unable to create an author signature, using committer signature instead.');
            signatures.Author = Signature.now(signatures.Committer.name(), signatures.Committer.email());
        }
    } else {
        if (!signatures.Committer) {
            console.debug('Unable to create a committer signature, using author signature instead.');
            signatures.Committer = Signature.now(signatures.Author.name(), signatures.Author.email());
        }
    }
    
    return signatures;
}

Reference.prototype.toString = function getReferenceString(verbose: boolean = false) {
    return this.name()
         + ' -> type=' + this.type() 
         + ', isBranch=' + (this.isBranch() == 1) 
         + ', isConcrete=' + this.isConcrete()
         + ', isHead=' + this.isHead()
        //  + ', isNote=' + (this.isNote() == 1)
         + ', isRemote=' + (this.isRemote() == 1) 
        //  + ', isSymbolic=' + this.isSymbolic()
        //  + ', isTag=' + this.isTag()
        //  + ', isValid=' + this.isValid()
        //  + ', target=' + this.target()
    ;
}

// @ts-ignore
Repository.prototype.logStatus = async function logStatus() {
    console.debug(`Current status of working tree '${this.workdir()}':`)
    await this.getStatus().then(statusFiles => {
        if (statusFiles.length <= 1) {
            console.debug('Nothing to commit, working tree clean.')
        } else {
            statusFiles.forEach(file => {
                file.status().forEach(status => {
                    console.debug(`${status.padEnd(12)}\t'${file.path()}'`);
                });
            });
        }
    }).catch(reason => {
        console.error(reason);
    })
};

export class GitDownstreamProvider implements ifs.IDownstreamProvider {
    Initialize(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            await Repository.open(path.join(downstreamFolder, '.git')).then(async repo => {
                console.info(`Opened git repository '${repo.path()}' with working tree '${repo.workdir()}'.`);

                var propertyBag = new GitPropertyBag(repo);

                console.debug(`Checking branch '${buildInfo.RepositoryBranch}' ...\b`);
                await repo.getBranch(`refs/heads/${buildInfo.RepositoryBranch}`).then(async ref => {
                    console.debug('\bok.');
                    console.debug(`Found branch '${ref.toString()}', forcing checkout ...\b`);
                    await repo.checkoutRef(ref, { checkoutStrategy: Checkout.STRATEGY.FORCE}).then(ref => {
                        console.debug('\bok.');
                    });
                }).catch(reason => {
                    console.debug('\bfailed.');
                    console.error(`Failed checking branch '${buildInfo.RepositoryBranch}'.`);
                    return reject(reason);
                });
        
                var detachedState: number = repo.headDetached();
                switch (detachedState)
                {
                    case 0:
                        console.debug(`Current HEAD status of git repo '${repo.path()}' is non-detached.`);
                        break;
                    case 1:
                        console.info(`Resolving 'detached HEAD' state of git repo '${repo.path()}'.`);
                        console.debug(`References are:`);
                        var references: Reference[] = (await repo.getReferences()).filter(ref => {
                            console.debug(ref.toString());
                            return ref.isBranch() && !ref.isRemote();
                        });
                        console.debug(`Found ${references.length} branch(es) to check out, using first one ...`);
                        await repo.checkoutRef(references[0]).catch(reason => console.log(reason));
                        console.debug('Current branch is now:');
                        await repo.getCurrentBranch().then(async ref => {
                            console.debug(ref.toString());
                        }).catch(reason => {
                            console.error(reason);
                            return reject(reason);
                        });
                        detachedState = repo.headDetached();
                        break;
                    default:
                        return reject(Error(`${typeof(Repository).name}.headDetached() returned error code ${detachedState}`));
                }
                if (detachedState != 0) { throw `detachedState = ${detachedState}`; }
        
                await repo.getCurrentBranch().then(async ref => {
                    var branchNames: string[] = ref.name().split('/');
                    var branchName: string = branchNames[branchNames.length - 1];
                    console.debug(`Checking if branch '${branchName}' exists on remote '${buildInfo.RepositoryRemote}' ...\b`);
                    await repo.getReference(`refs/remotes/${buildInfo.RepositoryRemote}/${branchName}`).then(async ref => {
                        console.debug(`\bok.`);
                        console.debug(`Found reference '${ref.toString()}'.`);
                        await repo.getRemote(buildInfo.RepositoryRemote).then(remote => {
                            var repositoryUrl: string = remote.url();
                            if (!(buildInfo.RepositoryUrl === repositoryUrl)) {
                                console.debug(`Adjusting build.RepositoryUrl from '${buildInfo.RepositoryUrl}' to '${repositoryUrl}'.`);
                                buildInfo.RepositoryUrl = repositoryUrl; 
                            }
                        });
                    });
                })

                buildInfo.PropertyBag = propertyBag;
                resolve(buildInfo);
            }).catch(err => {
                return reject(err);
            });
        });
    }

    Process(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            var propertyBag: GitPropertyBag = <GitPropertyBag>buildInfo.PropertyBag;
            var repo: Repository = propertyBag.repo;

            var gitIgnore: string[] = [];
            var addIgnore: string[] = ['.pit/*'];
            var ignoreFile = path.join(repo.workdir(), ".gitignore");
            if (fs.existsSync(ignoreFile)) {
                gitIgnore = fs.readFileSync(ignoreFile, {  encoding: 'UTF-8'}).split('\n');
                console.info(`Updating '${ignoreFile}'`);
                console.debug(`Current content of '${ignoreFile}':${os.EOL}${gitIgnore.join(os.EOL)}`);
            } else {
                console.info(`Creating '${ignoreFile}'`);
            }
            addIgnore.forEach(line => {
                if (!gitIgnore.includes(line)) {
                    gitIgnore.push(line);
                }
            });
            fs.writeFileSync(ignoreFile, gitIgnore.join('\n'), {encoding: 'UTF-8'});
            gitIgnore = fs.readFileSync(ignoreFile, {  encoding: 'UTF-8'}).split('\n');
            console.debug(`New content of '${ignoreFile}':${os.EOL}${gitIgnore.join(os.EOL)}`);
    
            resolve(buildInfo);
        });
    }

    Finalize(downstreamFolder: string, buildInfo: ifs.IBuildInfo): Promise<ifs.IBuildInfo> {
        return new Promise<ifs.IBuildInfo>(async (resolve, reject) => {
            var propertyBag: GitPropertyBag = <GitPropertyBag>buildInfo.PropertyBag;
            var repo: Repository = propertyBag.repo;

            console.info(`Evaluating signatures.`);
            var signatures: Signatures = await GetSignatures(buildInfo, repo);
            console.info(`Author    signature: ${signatures.Author?.toString()}`);
            console.info(`Committer signature: ${signatures.Committer?.toString()}`);
        
            // @ts-ignore
            await repo.logStatus();
            await repo.index().then(async index => {
                console.info('Applying all changes.');
                await index.addAll(undefined, 0, (path: string, matched_pathspec: string, payload: any) => {
                    console.debug(`Adding to index: '${path}'`);
                    return 0;
                });
                index.write();
                return index.writeTree();
            }).then(async tree => {
                // @ts-ignore
                await repo.logStatus();
                await Reference.nameToId(repo, "HEAD").then(head => {
                    return repo.getCommit(head);
                }).then(parent => {
                    console.info('Committing all changes.');
                    return repo.createCommit("HEAD", <Signature>signatures.Author, <Signature>signatures.Committer, (<cls.BuildInfo>buildInfo).Messages.join('\n'), tree, [parent]);
                }).then(commit => {
                    console.debug('New commit: ' + commit);
                    //repo.index().then(index => index.push);
                });
            });
            // @ts-ignore
            await repo.logStatus();
            
            console.debug(`Cleaning up temporary repository '${repo.path()}' ...\b`);
            repo.cleanup();
            console.debug('\bok.');

            resolve(buildInfo);
        });
    }
}