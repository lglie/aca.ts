import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import orm from '../orm'

// command format：aca add [dirname] -s(-c)
export async function addApp(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const argv = yargs.argv
  const server = Cst.DefaultServerName,
    client = Cst.DefaultClientName
  const kind =
    argv.server || argv.s ? server : argv.client || argv.c ? client : ''
  if (!kind) throw new Error(`Missing Command Parameters：--server or：--client`)
  const DefaultApiDir = path.join(
    Cst.DefaultTsDir,
    { server: Cst.DefaultServerApiDir, client: Cst.DefaultClientApiDir }[kind]
  )
  const apiDir = argv.a || argv.apiDir || DefaultApiDir
  let name: string = argv._[1]

  if (workDir === Cst.AcaDir) {
    if (!name)
      name = {
        server,
        client,
      }[kind]
    if (!fs.existsSync(name) || !fs.statSync(name).isDirectory())
      throw new Error(`The app '${name}' does not exist under this project`)
  } else {
    // The command to create other app configurations under the current app directory
    if (name) {
      // Determine if the app exists
      const namePath = path.join(acaDir, name)
      if (!fs.existsSync(namePath) || !fs.statSync(namePath).isDirectory())
        throw new Error(`The app '${name}' does not exist`)
    } else name = workDir
  }

  const dbs = (await orm(acaDir)).dbs
  const expArr = Object.keys(dbs).concat(
    kind === 'server' ? Cst.ServerApiExport : Cst.ClientApiExport
  )

  addAppConfig(acaDir, name, kind, expArr, apiDir)
  console.log(
    `The setting of the app has been written to： ${Cst.AcaConfig} file，open the following link to configure：
${path.join(path.resolve(acaDir), Cst.AcaConfig)}
`
  )
}
