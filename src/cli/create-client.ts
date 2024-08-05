import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import { reactPage } from '../libs/templates'
import { execSync } from 'child_process'
import orm from '../orm'

export async function client(yargs: any) {
  const currDir = currentDir()
  if (!currDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const argv = yargs.argv
  const acaDir = currDir === '.' ? '.' : '..'
  const acaRoot = path.resolve(acaDir)
  const name = argv._[1] || Cst.DefaultClientName
  if (fs.existsSync(path.join(acaRoot, name)))
    throw new Error(`The app '${name}' already exists and cannot be created`)
  console.log(
    `Creating app '${name}' using create-react-app, may take a few munites...`
  )
  process.chdir(acaRoot)
  execSync(`npm config set registry https://registry.npmmirror.com/`)
  execSync(`npx create-react-app ${name} --template typescript`)
  const dbs = (await orm('.')).dbs
  const expArr = Object.keys(dbs).concat(Cst.ClientApiExport)
  fs.writeFileSync(
    path.join(acaRoot, name, Cst.DefaultTsDir, 'App.tsx'),
    reactPage(expArr.join(', '))
  )
  const argvF = argv.fetcher || argv.f || ''

  addAppConfig(
    '.',
    name,
    'client',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir),
    argvF
  )
}
