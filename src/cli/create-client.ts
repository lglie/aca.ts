import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import { reactPage } from '../libs/templates'
import { execSync } from 'child_process'
import orm from '../orm'

export async function client(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const argv = yargs.argv
  const rlvAcaDir = path.resolve(acaDir)
  const name = argv._[1] || Cst.DefaultClientName
  if (fs.existsSync(path.join(rlvAcaDir, name)))
    throw new Error(`The app '${name}' already exists and cannot be created`)
  const command = `npx create-react-app ${name} --template typescript`
  console.log(
    `Creating app '${name}' using create-react-app, may take a few munites...`
  )
  execSync(`${acaDir === '..' ? 'cd .. & ' : ''}${command}`)
  const dbs = (await orm(acaDir)).dbs
  const expArr = Object.keys(dbs).concat(Cst.ClientApiExport)
  fs.writeFileSync(
    path.join(rlvAcaDir, name, Cst.DefaultTsDir, 'App.tsx'),
    reactPage(expArr.join(', '))
  )

  addAppConfig(
    acaDir,
    name,
    'client',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
  )
}
