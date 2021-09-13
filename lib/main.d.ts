declare const core: any;
declare const github: any;
declare const io: any;
declare const tc: any;
declare const fs: any;
declare const path: any;
declare const dotenv: any;
declare const uuidv4: any;
/**
 * Sets env variable for the job
 */
declare const exportToGithubEnv: (envData?: {}) => void;
/**
 * Sets output variable that can be used between jobs
 */
declare const exportToOutput: (envData?: {}) => void;
/**
 * Determines target configuration filename based on action settings
 */
declare const buildEnvFilename: (root: any, directory: any, filename: any, profile?: string) => any;
/**
 * Parse env file
 */
declare const loadDotenvFile: (filepath: any) => any;
/**
 * Fetches files from remote configserver
 */
declare const cloneDotenvConfig: (owner: any, repo: any, branch: any, token: any, destination: any) => Promise<any>;
/**
 * Remove configserver files from runner
 */
declare const cleanup: (configDirectory: any, cleanup?: boolean) => Promise<void>;
declare const inputs: () => {
    repository: any;
    owner: any;
    repo: any;
    token: any;
    branch: any;
    destination: any;
    directory: any;
    filename: any;
    profile: any;
    cleanup: any;
};
declare function run(): Promise<void>;
