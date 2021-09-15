# Load Environment Variables Action
__Description__: Load dotenv (.env) files from a remote repository and load it to `GITHUB_ENV` and `outputs`.

## Table of content
* [Usage](#usage)
* [Credits and references](#credits-and-references)

## Inputs
  Input  | Required | Description                                                                                                                            | Example                                                                                                 |
|:-----------:|:--------:|----------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
|  repository |   true   | The remote repository (configserver). Format: `<owner>/<repo>`                                                                                                      | `repository: "the-iron-bank-of-braavos/load-env-vars-action"`                                                              |
|    token    |   false   | This should be a token with access to your repository scoped in as a secret (default to GITHUB_TOKEN)                                                            | `token: ${{ secrets.GITHUB_TOKEN }}`                                                                    |
|    branch   |   false  | The remote branch to checkout (default: main)                                                                                          | `branch: "staging"`                                                                                     |
| destination |   false  | The working folder to write configuration to (default 'RUNNER_TEMP')                                                                   | `destination: "/my/dest/folder"`                                                                        |
|  directory  |   false  | Look for file in configserver subdirectory (default '.').<br>Useful if your configserver hosts several config directories in it        | `directory: "my-app-dir"`                                                                               |
|   filename  |   false  | The config filename (default to '.env')                                                                                                | `filename: "my-application.env"`                                                                        |
|   profile   |   false  | Profile for file (ex: 'prod' will make tool <br>look for <filename_part>-<profile>.<filename_extension>)<br><br>If empty, won't apply. | `profile: "prod"`<br>Depending on filename will make action look for file:<br>`my-application-prod.env` |
|   cleanup   |   false  | If false, won't delete configuration files downloaded after loading to GITHUB_ENV (default: true)                                      | `cleanup: false`


## Usage
  
Example with Token
  
```yaml
jobs:  
  test:
    name: Load Variables Test with Token
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: ./
        id: action-env
        with:
          repository: "${{ github.repository }}"
          token: "${{ secrets.GITHUB_TOKEN }}"
      - name: "See exported values"
        run: env        
      - name: Test
        run: |
          echo ${{ env.VAR1 }}
          echo ${{ env.VAR2 }}
          echo ${{ steps.action-env.outputs.VAR1 }}
          echo ${{ steps.action-env.outputs.VAR2 }}
```

Example with App Credentials  
  
```yaml
jobs:
  test-app:
    name: Load Variables test with App Client Credentials
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: ./
        id: action-env-app
        with:
          repository: "${{ github.repository }}"
          appId: ${{ secrets.APP_ID }}
          privateKey: ${{ secrets.APP_RSA_PRIVATE_KEY }}
          clientId: ${{ secrets.APP_CLIENT_ID }}
          clientSecret: ${{ secrets.APP_CLIENT_SECRET }}
      - name: "See exported values"
        run: env        
      - name: Test
        run: |
          echo ${{ env.VAR1 }}
          echo ${{ env.VAR2 }}
          echo ${{ steps.action-env.outputs.VAR1 }}
          echo ${{ steps.action-env.outputs.VAR2 }}
```

## Credits and references

Based on this action https://github.com/Steph0/dotenv-configserver
