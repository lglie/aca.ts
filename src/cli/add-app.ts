import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import orm from '../orm'

// command format: aca add [dirname] -s(-c)
export async function addApp(yargs: any) {
  const currDir = currentDir()
  if (!currDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = currDir === '.' ? '.' : '..'
  const argv = yargs.argv
  const server = Cst.DefaultServerName,
    client = Cst.DefaultClientName
  const argvS = argv.server || argv.s ? server : ''
  const argvC = argv.client || argv.c ? client : ''
  if (!argvS && !argvC)
    throw new Error(`Missing Command Parameters: --server or: --client`)
  let appName: string = argv._[1]

  if (currDir === '.') {
    if (!appName)
      throw new Error(`No appName, usage: aca add [appName] <-s -c>`)
    if (!fs.existsSync(appName) || !fs.statSync(appName).isDirectory())
      throw new Error(`The app '${name}' does not exist under this project`)
  } else {
    // The command to create other app configurations under the current app directory
    if (appName) {
      // Determine if the app exists
      const namePath = path.join(acaDir, appName)
      if (!fs.existsSync(namePath) || !fs.statSync(namePath).isDirectory())
        throw new Error(`The app '${name}' does not exist under this project`)
    } else appName = currDir
  }

  const dbs = Object.keys((await orm(acaDir)).dbs)
  let expArr, DefaultApiDir

  if (argvS && argvC) {
    expArr = dbs.concat(Cst.ServerApiExport)
    DefaultApiDir = path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
    addAppConfig(acaDir, appName, 'server', expArr, DefaultApiDir)
    expArr = dbs.concat(Cst.ClientApiExport)
    DefaultApiDir = path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
    addAppConfig(acaDir, appName, 'client', expArr, DefaultApiDir)
  } else {
    const kind = argvS || argvC
    expArr = dbs.concat(
      { server: Cst.ServerApiExport, client: Cst.ClientApiExport }[kind]
    )
    DefaultApiDir = path.join(
      Cst.DefaultTsDir,
      { server: Cst.DefaultServerApiDir, client: Cst.DefaultClientApiDir }[kind]
    )
    const apiDir = argv.a || argv.apiDir || DefaultApiDir
    addAppConfig(acaDir, appName, <any>kind, expArr, apiDir)
  }

  console.log(
    `The setting of the app has been written to:  ${
      Cst.AcaConfig
    } file, open the following link to configure: 
${path.join(path.resolve(acaDir), Cst.AcaConfig)}
`
  )
}
