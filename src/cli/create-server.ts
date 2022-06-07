import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir, MkdirsSync } from '../libs/common'
import { pkgServer, createdEchoServer, indexKoa } from '../libs/templates'
import { execSync } from 'child_process'
import orm from '../orm'

async function pkg(acaDir: AcaDir, dbs: Dbs, dir: string) {
  // Analyze the database drivers used in orm
  const drivers = Object.keys(dbs).reduce((_, v) => {
    _.add(dbs[v].config.connectOption.driver)
    return _
  }, new Set())

  fs.writeFileSync(
    `${acaDir}/${dir}/${Cst.ServerPackage}`,
    pkgServer(dir, <string[]>[...drivers]),
    'utf-8'
  )
}

// aca server
export async function server(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const acaRoot = path.resolve(acaDir)
  const name = yargs.argv['_'][1] || Cst.DefaultServerName
  if (fs.existsSync(path.join(acaRoot, name)))
    throw new Error(
      `The app '${name}' already exists and cannot be created again`
    )
  console.log(`Creating koa app...`)
  const dbs = (await orm(acaDir)).dbs
  const expArr = Object.keys(dbs).concat(Cst.ServerApiExport)
  const exp = expArr.join(', ')
  const templatePath = path.join(__dirname, '../../templates')
  const tsDir = path.join(acaRoot, name, Cst.DefaultTsDir)
  const tpl = {
    'index.ts': indexKoa(exp),
  }

  MkdirsSync(tsDir)

  for (const k in tpl) {
    fs.writeFileSync(path.join(tsDir, k), tpl[k])
  }

  fs.copyFileSync(
    path.join(templatePath, 'tsconfig.app'),
    path.join(acaRoot, name, Cst.ServerTsconfig)
  )
  // Introduce corresponding package according to the database required in orm and generate package.json file
  await pkg(acaDir, dbs, name)
  // Writing app in .app/config.json/serverApps
  addAppConfig(
    acaDir,
    name,
    'server',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
  )
  console.log(`loading npm, please wait...`)
  process.chdir(`${acaDir}/${name}`)
  execSync(`npm install`)
  console.log(createdEchoServer())
}
