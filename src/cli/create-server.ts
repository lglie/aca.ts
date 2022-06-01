import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir, MkdirsSync } from '../libs/common'
import {
  serverPkg,
  serverCreatedEcho,
  dft,
  faas,
  faasProvider,
  indexKoa,
  indexExpress,
} from '../libs/template'

import { execSync } from 'child_process'
import orm from '../orm'

async function pkg(
  acaDir: AcaDir,
  dbs: Dbs,
  dir: string,
  framework: 'koa' | 'express' | 'faas'
) {
  // Analyze the database drivers used in orm
  const drivers = Object.keys(dbs).reduce((_, v) => {
    _.add(dbs[v].config.connectOption.driver)
    return _
  }, new Set())

  fs.writeFileSync(
    `${acaDir}/${dir}/${Cst.ServerPackage}`,
    serverPkg(dir, <string[]>[...drivers], framework),
    'utf-8'
  )
}

// aca server --(koa, express, amazon,google,azure,ali,tencent)
export async function server(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const rlvAcaDir = path.resolve(acaDir)
  const name = yargs.argv['_'][1] || Cst.DefaultServerName
  if (fs.existsSync(path.join(rlvAcaDir, name)))
    throw new Error(`The app '${name}' already exists and cannot be created again`)
  const framework = yargs.argv.framework || yargs.argv.f
  if (framework && !Cst.ServerFramework.includes(framework))
    throw new Error(`framework error, one of ${Cst.ServerFramework.toString()}`)
  const dbs = (await orm(acaDir)).dbs
  const expArr = Object.keys(dbs).concat(Cst.ServerApiExport)
  const exp = expArr.join(', ')
  const templatePath = path.join(__dirname, '../../template')
  const tsDir = path.join(rlvAcaDir, name, Cst.DefaultTsDir)
  const apiDir = path.join(tsDir, Cst.DefaultServerApiDir)
  const tpl = {}
  // Generate corresponding files according to the framework
  switch (framework) {
    case 'express':
      tpl[`index.ts`] = indexExpress(exp)
      break
    case 'koa':
      tpl[`index.ts`] = indexKoa(exp)
      break
    case 'amazon':
    case 'azure':
    case 'google':
    case 'ali':
    case 'tencent':
      const fnName = {
        amazon: 'handle',
        azure: 'handle',
        google: 'handle',
        ali: 'handle',
        tencent: 'main_handle',
      }
      tpl[Cst.ServerServe] = faas(fnName[framework])
      tpl[`index.ts`] = faasProvider(framework, exp)
      break
    default:
      tpl[`index.ts`] = dft(exp)
  }

  MkdirsSync(tsDir)

  for (const k in tpl) {
    fs.writeFileSync(path.join(tsDir, k), tpl[k])
  }

  fs.copyFileSync(
    path.join(templatePath, 'tsconfig.app'),
    path.join(rlvAcaDir, name, Cst.ServerTsconfig)
  )
  // Introduce corresponding package according to the database required in orm and generate package.json file
  await pkg(
    acaDir,
    dbs,
    name,
    { koa: 'koa', express: 'express' }[framework] || 'faas'
  )
  // Writing app in .app/config.json/serverApps
  addAppConfig(
    acaDir,
    name,
    'server',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
  )
  console.log(`loading npm, please wait。。。`)
  execSync(`cd ${acaDir}/${name} & npm install`)
  console.log(serverCreatedEcho())
}
