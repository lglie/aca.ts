import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import { reactPage } from '../libs/template'
import { execSync } from 'child_process'
import orm from '../orm'

export async function client(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `当前目录不是aca项目目录，请转到项目目录或项目下的应用程序目录下运行该命令`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const argv = yargs.argv
  const rlvAcaDir = path.resolve(acaDir)
  const name = argv._[1] || Cst.DefaultClientName
  if (fs.existsSync(path.join(rlvAcaDir, name)))
    throw new Error(`该应用已经存在：${name}, 不能再创建`)
  const command = `npx create-react-app ${name} --template typescript`
  console.log(`正在使用create-react-app创建应用：${name}, 可能需要几分钟...`)
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
