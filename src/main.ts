import {inspect} from 'util'

const core = require('@actions/core')
const github = require('@actions/github')
const createAppAuth = require('@octokit/auth-app')
const io = require('@actions/io')
const tc = require('@actions/tool-cache')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const {v4: uuidv4} = require('uuid')

const getAppToken = async (
  organization,
  appId,
  privateKey,
  clientId,
  clientSecret
) => {
  // Define empty token
  //let token = 'empty'

  try {
    // Create octokit instance as app
    const appOctokit = github.getOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: appId,
        privateKey: privateKey
      }
    })

    // Retrieve app installations list
    const response = await appOctokit.request('GET /app/installations')
    const data = response.data

    core.debug(data)

    let installationId = Number(0)

    // Find app installationId by organization
    for (let i = 0; i < data.length; i++) {
      core.debug(`Installation: ${inspect(data[i])}`)
      if (data[i]?.account?.login === organization) {
        installationId = data[i].id
        break
      }
    }

    core.debug(`Installation ID: ${inspect(installationId)}`)
    if (installationId === 0) {
      throw new Error(
        'The ' +
          organization +
          ' organization has no privileges to access this app. Please, check your credentials and the organization permissions.'
      )
    }

    // Create app authentication
    const auth = createAppAuth({
      appId: appId,
      privateKey: privateKey,
      clientId: clientId,
      clientSecret: clientSecret
    })

    // Authenticate as app installation and retrieve access token
    const installationAuthentication = await auth({
      type: 'installation',
      installationId: installationId
    })

    // Set access token
    // token = installationAuthentication.token
    core.debug(installationAuthentication.token)
    const token = installationAuthentication.token

    // Throw error of invalid credentials if token is empty ( or not found ).
    if (token === '') {
      throw new Error(
        'Invalid credentials! You must provide a valid personal access token or valid Application Credentials. Application Credentials requires appId, privateKey, clientId, clientSecret, and installation. Please, review your defined credentials.'
      )
    }

    return token
  } catch (error) {
    core.setFailed(error.message)
  }
}

/**
 * Sets env variable for the job
 */
const exportToGithubEnv = (envData = {}) => {
  core.info(`Exporting to GITHUB_ENV`)
  for (const [envKey, envValue] of Object.entries(envData)) {
    core.info(`Exporting to GITHUB_ENV [${envKey}: ${envValue}]`)
    core.exportVariable(envKey, envValue)
  }
}

/**
 * Sets output variable that can be used between jobs
 */
const exportToOutput = (envData = {}) => {
  core.info(`Exporting to output`)
  for (const [envKey, envValue] of Object.entries(envData)) {
    core.info(`Exporting [${envKey}: ${envValue}]`)
    core.setOutput(envKey, envValue)
  }
}

/**
 * Determines target configuration filename based on action settings
 */
const buildEnvFilename = (root, directory, filename, profile = '') => {
  const hasExtension = filename.lastIndexOf('.') !== -1
  const namePart = hasExtension
    ? filename.substring(0, filename.lastIndexOf('.'))
    : filename
  const extensionPart = hasExtension
    ? filename.substring(filename.lastIndexOf('.'), filename.length)
    : ''
  core.debug(`${filename} -> name:[${namePart}], extension: [${extensionPart}]`)

  // If no profile, just use current filename
  let profiledFilename = filename
  if (profile) {
    if (namePart === '' && extensionPart !== '') {
      // Input from user has no filename (like just an extension '.env' file)
      // Inject profile without the '-' part
      // Ex: profile=prod + filename=.env => 'prod.env'
      profiledFilename = `${profile}${extensionPart}`
    } else if (namePart !== '' && extensionPart === '') {
      // Input from user has no extension, add '.env' to it automatically
      // Ex: profile=prod + filename=application => 'application-prod.env'
      profiledFilename = `${namePart}-${profile}.env`
    } else if (namePart !== '' && extensionPart !== '') {
      // Input has name + extension, inject profile between name and extension
      // Ex: profile=prod + filename=application.env => 'application-prod.env'
      profiledFilename = `${namePart}-${profile}${extensionPart}`
    }
  }

  return path.join(root, directory, profiledFilename)
}

/**
 * Parse env file
 */
const loadDotenvFile = filepath => {
  core.info(`Loading [${filepath}] file`)
  return dotenv.parse(fs.readFileSync(filepath))
}

/**
 * Fetches files from remote configserver
 */
const cloneDotenvConfig = async (owner, repo, branch, token, destination) => {
  // Making sure target path is accessible
  await io.mkdirP(destination)

  // Login with token
  const octokit = github.getOctokit(token)
  // Detect platform
  const onWindows = process.platform === 'win32'
  const downloadRepo = onWindows
    ? octokit.rest.repos.downloadZipballArchive
    : octokit.rest.repos.downloadTarballArchive
  const archiveExt = onWindows ? '.zip' : '.tar.gz'
  const extract = onWindows ? tc.extractZip : tc.extractTar

  const params = {
    owner: owner,
    repo: repo,
    ref: branch
  }
  core.info('Downloading zip archive')
  core.debug(params)
  const response = await downloadRepo(params)
  if (response.status != 200) {
    throw new Error(
      `Enable to fetch repository. HTTP:[${response.status}], content:[${response.data}]`
    )
  }

  const downloadUuid = uuidv4()
  const archiveFilepath = path.join(
    destination,
    `archive-${repo}-${downloadUuid}${archiveExt}`
  )
  core.info(`Writing archive file [${archiveFilepath}] to disk`)
  const archiveData = Buffer.from(response.data)
  await fs.promises.writeFile(archiveFilepath, archiveData)

  // Extract archive
  const repoPath = path.join(destination, `${repo}-${downloadUuid}`)
  core.info(`Extracting archive to [${repoPath}]`)
  await extract(archiveFilepath, repoPath)

  // Cleanup archive
  await io.rmRF(archiveFilepath)

  // Env content is in archives single folder
  const archiveContent = await fs.promises.readdir(repoPath)
  const dotenvConfigPath = path.resolve(path.join(repoPath, archiveContent[0]))
  core.info(`Configuration available at [${dotenvConfigPath}]`)

  return dotenvConfigPath
}

/**
 * Remove configserver files from runner
 */
const cleanup = async (configDirectory, cleanup = true) => {
  if (!configDirectory) {
    throw new Error('Could not find a config directory to delete')
  }

  if (!cleanup) {
    core.warning(
      'Downloaded configuration from configserver has not been cleaned from runner'
    )
    return
  }

  await io.rmRF(configDirectory)
  core.info(`Configuration cleaned from runner`)
}

const inputs = () => {
  return {
    // The repository to fetch (<owner>/<repo>)
    repository: core.getInput('repository', {required: true}),
    owner: core.getInput('repository', {required: true}).split('/')[0],
    repo: core.getInput('repository', {required: true}).split('/')[1],
    appId: core.getInput('appId', {required: false}),
    privateKey: core.getInput('privateKey', {required: false}),
    clientId: core.getInput('clientId', {required: false}),
    clientSecret: core.getInput('appId', {clientSecret: false}),

    // This should be a token with access to your repository scoped in as a secret
    // token: ${{ secrets.GITHUB_TOKEN }}
    token: core.getInput('token', {required: false}),

    // The remote branch to checkout (default: main)
    branch: core.getInput('branch') || 'main',

    // The working folder to write configuration to (default 'RUNNER_TEMP')
    destination:
      core.getInput('destination') || process.env['RUNNER_TEMP'] || '.',

    // Look for file in subdirectory (default '.')
    directory: core.getInput('directory') || '.',

    // The config filename (default to '.env')
    filename: core.getInput('filename') || '.env',

    // profile for file (ex: 'prod' will make tool look for <filename_part>-<profile>.<filename_extension>)
    // extension represents the last dot of a filename (if any)
    // if empty, won't apply
    profile: core.getInput('profile') || '',

    // If false, won't delete configuration files downloaded after loading to GITHUB_ENV
    cleanup: core.getInput('cleanup') || true
  }
}

// Most @actions toolkit packages have async methods
// 'core.debug' displays only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
async function run() {
  try {
    // Load inputs
    const settings = inputs()
    core.debug(settings)

    let token = settings.token

    core.debug('DEBUG INPUTS:')
    core.debug('APP ID:' + settings.appId)
    core.debug('APP PRIVATE KEY:' + settings.privateKey)
    core.debug('APP CLIENT ID:' + settings.clientId)
    core.debug('APP CLIENT SECRET:' + settings.clientSecret)

    if (
      settings.appId &&
      settings.privateKey &&
      settings.clientId &&
      settings.clientSecret
    ) {
      core.debug('ENTRAR ENTRA EN EL IF')

      const res = await getAppToken(
        settings.owner,
        settings.appId,
        settings.privateKey,
        settings.clientId,
        settings.clientSecret
      )

      res.then((e) => {
        token = e
      })

      core.debug('AHORA VIENE EL TOKEN:'+token)
      res.then((e) => core.debug('MY TIKTOK IS:'+e))

    }

    // This sould be removed
    // throw new Error('STOP!')

    if (token === '') {
      throw new Error(
        'Authorization required!. You must provide a Personal Access Token or an Application Credentials. Application Credentials requires appId, privateKey, clientId, clientSecret, and installation.'
      )
    }

    // Clone remote configserver
    const configDirectory = await cloneDotenvConfig(
      settings.owner,
      settings.repo,
      settings.branch,
      token,
      settings.destination
    )

    // Define file to look for in configserver
    const configurationFile = buildEnvFilename(
      configDirectory,
      settings.directory,
      settings.filename,
      settings.profile
    )
    core.info(`Expected configuration filename: [${configurationFile}]`)

    // Load targeted configserver file content
    const envData = loadDotenvFile(configurationFile)
    core.debug(envData)

    // Publish file to GITHUB_ENV
    exportToGithubEnv(envData)
    core.info(
      `Configuration successfully loaded from configserver to GITHUB_ENV`
    )

    // Publish file to output
    exportToOutput(envData)
    core.info(`Configuration successfully loaded from configserver to output`)

    // Clean download env files
    await cleanup(configDirectory, settings.cleanup)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
