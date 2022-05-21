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
  // 分析orm中用到的数据库驱动程序
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
      `当前目录不是aca项目目录，请转到项目目录或项目下的应用程序目录下运行该命令`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const rlvAcaDir = path.resolve(acaDir)
  const name = yargs.argv['_'][1] || Cst.DefaultServerName
  if (fs.existsSync(path.join(rlvAcaDir, name)))
    throw new Error(`该应用已经存在：${name}, 不能再创建`)
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
  // 根据框架生成相应的文件
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
  // 根据orm中需要的数据库引入相应的包,并生成package.json文件
  await pkg(
    acaDir,
    dbs,
    name,
    { koa: 'koa', express: 'express' }[framework] || 'faas'
  )
  // 将应用写入.app/config.json/serverApps
  addAppConfig(
    acaDir,
    name,
    'server',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
  )
  console.log(`正在装载node_modules，请稍等。。。`)
  execSync(`cd ${acaDir}/${name} & npm install`)
  console.log(serverCreatedEcho())
}
